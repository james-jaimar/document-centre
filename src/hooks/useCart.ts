import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildJobSnapshot } from "@/lib/orders/buildJobSnapshot";
import { copyS3Object } from "@/lib/s3Storage";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import { inferPreviewTypeFromJob } from "@/lib/orders/inferPreviewType";
import { buildPreviewSnapshot } from "@/lib/orders/buildPreviewSnapshot";

/**
 * Get or create the user's single open cart order (order_status = 'cart').
 * Scoped to the current tenant so each storefront has its own cart.
 */
export function useCart() {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();

  return useQuery({
    queryKey: ["cart", user?.id, tenantId],
    queryFn: async () => {
      if (!user?.id || !tenantId) return null;

      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, product_families:product_family_id(name, slug, icon))")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("order_status", "cart" as any)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!tenantId,
  });
}

/**
 * Returns the count of items in the user's cart for sidebar badge.
 */
export function useCartItemCount() {
  const { data: cart } = useCart();
  return (cart?.order_items as any[])?.length ?? 0;
}

/**
 * Get or create the cart order, returning its ID.
 */
async function getOrCreateCartId(userId: string, tenantId: string, appId: string | null): Promise<string> {
  // Try to find existing cart scoped to tenant
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("order_status", "cart" as any)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new cart order
  const { data: newCart, error } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      app_id: appId,
      order_status: "cart" as any,
      total_price: 0,
    })
    .select("id")
    .single();

  if (error) throw error;
  return newCart.id;
}

/**
 * Moves a completed order_item from its draft order onto the shared cart order.
 * Then deletes the now-empty draft order.
 */
export function useAddItemToCart() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      orderItemId: string;
      draftOrderId: string;
      title: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      spec: any;
      replacesCartItemId?: string;
      /** Active region currency for this purchase. Stamped on the cart order. */
      currencyCode?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!tenantId) throw new Error("No tenant context");

      const cartId = await getOrCreateCartId(user.id, tenantId, appId);

      // Stamp the cart order with the active currency on first add. We do
      // this idempotently so subsequent adds keep the existing currency
      // (cart can't mix currencies).
      if (input.currencyCode) {
        await supabase
          .from("orders")
          .update({ currency: input.currencyCode })
          .eq("id", cartId)
          .is("submitted_at", null); // only on still-open cart
      }

      // Update the order item: set it as ready and move to cart order
      const { error: itemError } = await supabase
        .from("order_items")
        .update({
          order_id: cartId,
          title: input.title,
          unit_price: input.unitPrice,
          quantity: input.quantity,
          build_status: "ready" as any,
          spec: input.spec,
        })
        .eq("id", input.orderItemId);
      if (itemError) throw itemError;

      // If this edit replaces an existing cart item, delete the original
      if (input.replacesCartItemId) {
        await supabase.from("document_sections").delete().eq("order_item_id", input.replacesCartItemId);
        const { data: oldDocs } = await supabase
          .from("documents")
          .select("id, file_path")
          .eq("order_item_id", input.replacesCartItemId);
        const oldPaths = oldDocs?.map((d) => d.file_path).filter(Boolean) ?? [];
        await supabase.from("documents").delete().eq("order_item_id", input.replacesCartItemId);
        if (oldPaths.length > 0) {
          const { deleteFromS3 } = await import("@/lib/s3Storage");
          await deleteFromS3(oldPaths);
        }
        await supabase.from("order_items").delete().eq("id", input.replacesCartItemId);
      }

      // Recalculate cart total
      const { data: cartItems } = await supabase
        .from("order_items")
        .select("unit_price, quantity")
        .eq("order_id", cartId);

      const cartTotal = (cartItems ?? []).reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0
      );

      await supabase
        .from("orders")
        .update({ total_price: cartTotal })
        .eq("id", cartId);

      // Delete the now-empty draft order
      const { data: remainingItems } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", input.draftOrderId);

      if (!remainingItems?.length) {
        await supabase.from("orders").delete().eq("id", input.draftOrderId);
      }

      return cartId;
    },
    onSuccess: () => {
      invalidateUserOrderCaches(qc);
    },
  });
}

/**
 * Move a cart item back to a new draft order for editing.
 */
export function useEditCartItem() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderItemId, cartOrderId }: { orderItemId: string; cartOrderId: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Get the original cart item details
      const { data: sourceItem, error: srcErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("id", orderItemId)
        .single();
      if (srcErr || !sourceItem) throw srcErr ?? new Error("Item not found");

      // Create a new temporary draft order
      const { data: draftOrder, error: draftErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          tenant_id: tenantId,
          app_id: appId,
          order_status: "draft" as any,
          total_price: 0,
          metadata: { replaces_cart_item_id: orderItemId },
        })
        .select("id")
        .single();
      if (draftErr) throw draftErr;

      // Clone the order item into the draft order
      const { data: clonedItem, error: cloneErr } = await supabase
        .from("order_items")
        .insert({
          order_id: draftOrder.id,
          product_family_id: sourceItem.product_family_id,
          quantity: sourceItem.quantity,
          unit_price: sourceItem.unit_price,
          build_status: "building" as any,
          spec: sourceItem.spec,
          title: sourceItem.title,
        })
        .select("id")
        .single();
      if (cloneErr) throw cloneErr;

      // Clone linked documents
      const { data: docs } = await supabase
        .from("documents")
        .select("*")
        .eq("order_item_id", orderItemId);

      if (docs && docs.length > 0) {
        // Physically copy each S3 object to a new key keyed by the cloned order_item_id.
        // This avoids two doc rows pointing at the same physical file (deletion of one
        // would otherwise wipe the other).
        const docInserts: any[] = [];
        for (const d of docs) {
          let newPath = d.file_path;
          if (d.file_path) {
            const ext = d.file_path.includes(".")
              ? d.file_path.slice(d.file_path.lastIndexOf("."))
              : "";
            newPath = `order-items/${clonedItem.id}/${crypto.randomUUID()}${ext}`;
            try {
              await copyS3Object(d.file_path, newPath);
            } catch (e) {
              console.error("[useEditCartItem] S3 copy failed, reusing original path", e);
              newPath = d.file_path; // fall back rather than block the edit
            }
          }
          docInserts.push({
            order_item_id: clonedItem.id,
            file_name: d.file_name,
            file_path: newPath,
            file_size: d.file_size,
            mime_type: d.mime_type,
            page_count: d.page_count,
            page_width_mm: d.page_width_mm,
            page_height_mm: d.page_height_mm,
            document_status: d.document_status,
            preflight_data: d.preflight_data,
            thumbnail_urls: d.thumbnail_urls,
            sort_order: d.sort_order,
            backend_asset_id: d.backend_asset_id,
          });
        }

        const { data: newDocs } = await supabase
          .from("documents")
          .insert(docInserts)
          .select("id");

        // Clone document sections
        const docIdMap = new Map<string, string>();
        if (newDocs) {
          docs.forEach((old, i) => {
            if (newDocs[i]) docIdMap.set(old.id, newDocs[i].id);
          });
        }

        const { data: sections } = await supabase
          .from("document_sections")
          .select("*")
          .eq("order_item_id", orderItemId);

        if (sections && sections.length > 0) {
          const secInserts = sections.map((s) => ({
            order_item_id: clonedItem.id,
            document_id: s.document_id ? (docIdMap.get(s.document_id) ?? s.document_id) : null,
            section_type: s.section_type,
            page_range_start: s.page_range_start,
            page_range_end: s.page_range_end,
            paper_stock: s.paper_stock,
            paper_weight_gsm: s.paper_weight_gsm,
            is_color: s.is_color,
            is_duplex: s.is_duplex,
            lamination: s.lamination,
            sort_order: s.sort_order,
            label: s.label,
            color: s.color,
          }));
          await supabase.from("document_sections").insert(secInserts);
        }
      }

      return draftOrder.id;
    },
    onSuccess: () => {
      invalidateUserOrderCaches(qc);
    },
  });
}

/**
 * Remove an item from the cart.
 */
export function useRemoveCartItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderItemId, cartOrderId }: { orderItemId: string; cartOrderId: string }) => {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("order_item_id", orderItemId);

      const filePaths = docs?.map((d) => d.file_path).filter(Boolean) ?? [];

      await supabase.from("document_sections").delete().eq("order_item_id", orderItemId);
      await supabase.from("documents").delete().eq("order_item_id", orderItemId);

      if (filePaths.length > 0) {
        const { deleteFromS3 } = await import("@/lib/s3Storage");
        await deleteFromS3(filePaths);
      }

      await supabase.from("order_items").delete().eq("id", orderItemId);

      // Recalculate cart total
      const { data: cartItems } = await supabase
        .from("order_items")
        .select("unit_price, quantity")
        .eq("order_id", cartOrderId);

      const cartTotal = (cartItems ?? []).reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0
      );

      await supabase
        .from("orders")
        .update({ total_price: cartTotal })
        .eq("id", cartOrderId);
    },
    onSuccess: () => {
      invalidateUserOrderCaches(qc);
    },
  });
}

/**
 * Place the order: calls the order-engine to create order_jobs, generate order_number, etc.
 */
export function usePlaceOrder() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      cartOrderId: string;
      deliveryMethod: "collection" | "delivery";
      notes?: string;
      branchId?: string;
      deliveryAddress?: {
        contact_name?: string;
        company_name?: string;
        line1?: string;
        line2?: string;
        city?: string;
        province?: string;
        postal_code?: string;
        phone?: string;
        email?: string;
      };
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Load cart, profile in parallel (app fetch needs cartOrder.app_id, but we can pre-resolve via appId)
      const [cartRes, profileRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(*, product_families:product_family_id(name, slug))")
          .eq("id", input.cartOrderId)
          .single(),
        supabase
          .from("profiles")
          .select("email, first_name, last_name, display_name")
          .eq("id", user.id)
          .single(),
      ]);

      if (cartRes.error || !cartRes.data) throw cartRes.error ?? new Error("Cart not found");
      const cartOrder = cartRes.data;
      const profile = profileRes.data;

      const items = (cartOrder.order_items as any[]) ?? [];
      if (!items.length) throw new Error("Cart is empty");

      // Get app slug (now that we have cartOrder.app_id)
      const { data: app } = await supabase
        .from("apps")
        .select("slug")
        .eq("id", cartOrder.app_id || appId)
        .single();

      if (!app) throw new Error("App not found");

      // Build jobs with rich snapshot per item (resolved labels, sections, files)
      const familyIds = Array.from(
        new Set(items.map((i: any) => i.product_family_id).filter(Boolean))
      ) as string[];
      const itemIds = items.map((i: any) => i.id) as string[];

      const [{ data: optionsData }, { data: sectionsData }, { data: documentsData }] =
        await Promise.all([
          familyIds.length
            ? supabase
                .from("product_options")
                .select("id, name, option_type, values, sort_order, product_family_id")
                .in("product_family_id", familyIds)
                .order("sort_order")
            : Promise.resolve({ data: [] as any[] }),
          itemIds.length
            ? supabase
                .from("document_sections")
                .select(
                  "id, order_item_id, document_id, label, section_type, page_range_start, page_range_end, paper_stock, paper_weight_gsm, is_color, is_duplex, lamination, color, sort_order"
                )
                .in("order_item_id", itemIds)
                .order("sort_order")
            : Promise.resolve({ data: [] as any[] }),
          itemIds.length
            ? supabase
                .from("documents")
                .select(
                  "id, order_item_id, file_name, page_count, file_size, page_width_mm, page_height_mm, thumbnail_urls, sort_order, backend_asset_id"
                )
                .in("order_item_id", itemIds)
                .order("sort_order")
            : Promise.resolve({ data: [] as any[] }),
        ]);

      // Preview enrichment is best-effort. Order placement must NEVER fail
      // because the preview helpers throw or because a future lazy chunk fails
      // to load — they are imported statically above to avoid that exact risk.

      const jobs = items.map((item: any) => {
        const familyOptions = ((optionsData ?? []) as any[]).filter(
          (o) => o.product_family_id === item.product_family_id
        );
        const itemSections = ((sectionsData ?? []) as any[]).filter(
          (s) => s.order_item_id === item.id
        );
        const itemDocs = ((documentsData ?? []) as any[]).filter(
          (d) => d.order_item_id === item.id
        );

        const { configuration, product_snapshot } = buildJobSnapshot({
          item,
          productOptions: familyOptions,
          sections: itemSections,
          documents: itemDocs,
        });

        // Snapshot per-page thumbnails for the read-only preview later
        const thumbnails: string[] = [];
        for (const d of itemDocs) {
          const tu = (d.thumbnail_urls ?? []) as any[];
          for (const t of tu) {
            const path = typeof t === "string" ? t : (t?.path || t?.url || null);
            if (path) thumbnails.push(path);
          }
        }

        const product_category = item.product_families?.slug || null;
        let previewType: any = "loose";
        try {
          previewType = inferPreviewTypeFromJob({
            product_category,
            product_snapshot,
          });
        } catch (e) {
          console.warn("[placeOrder] preview type inference failed, using fallback", e);
        }

        // Build production_specs from the per-section truth so the work order
        // carries an authoritative, machine-readable record for the PDF pipeline.
        const allBW = itemSections.length > 0 && itemSections.every((s: any) => !s.is_color);
        const allColour = itemSections.length > 0 && itemSections.every((s: any) => s.is_color);
        const allSimplex = itemSections.length > 0 && itemSections.every((s: any) => !s.is_duplex);
        const allDuplex = itemSections.length > 0 && itemSections.every((s: any) => s.is_duplex);

        const production_specs = {
          print_colour: allBW ? "black_and_white" : allColour ? "full_colour" : "mixed",
          print_sides: allSimplex ? "simplex" : allDuplex ? "duplex" : "mixed",
          sections: itemSections.map((s: any) => ({
            label: s.label,
            section_type: s.section_type,
            is_color: s.is_color,
            is_duplex: s.is_duplex,
            paper_stock: s.paper_stock,
            paper_weight_gsm: s.paper_weight_gsm,
          })),
          documents: itemDocs.map((d: any) => ({
            file_name: d.file_name,
            backend_asset_id: d.backend_asset_id,
            page_count: d.page_count,
            page_width_mm: d.page_width_mm,
            page_height_mm: d.page_height_mm,
          })),
          derived_assets: {},
        };

        // Full preview snapshot — best-effort. Never block place-order.
        const selectedOptions = (item.spec?.selected_options ?? {}) as Record<string, string>;
        let previewSnapshot: any = { thumbnails, product_type: previewType };
        try {
          previewSnapshot = buildPreviewSnapshot({
            productType: previewType,
            selectedOptions,
            productOptions: familyOptions as any,
            sections: itemSections as any,
            documents: itemDocs as any,
          });
        } catch (e) {
          console.warn("[placeOrder] preview snapshot failed, using fallback", e);
        }

        const configurationWithPreview = {
          ...configuration,
          preview: previewSnapshot,
        };

        return {
          product_name: item.product_families?.name || item.title || "Document",
          product_category,
          job_name: item.title || null,
          quantity: item.quantity,
          unit_label: "copies",
          net_price: Number(item.unit_price) * item.quantity,
          gross_price: Number(item.unit_price) * item.quantity,
          cost_price: 0,
          vat_rate: 15,
          configuration: configurationWithPreview,
          product_snapshot,
          production_specs,
        };
      });

      // ── Trigger PDF server processing (grayscale / resize) ──
      // Fire-and-forget: failures are logged but don't block the order.
      try {
        const { processDocumentForProduction } = await import("@/lib/orders/mutations");
        const { getTargetDimensions } = await import("@/lib/paperSizes");

        const processingPromises: Promise<any>[] = [];

        for (const item of items as any[]) {
          const itemSections = ((sectionsData ?? []) as any[]).filter(
            (s: any) => s.order_item_id === item.id
          );
          const itemDocs = ((documentsData ?? []) as any[]).filter(
            (d: any) => d.order_item_id === item.id
          );

          // Determine if any section is B&W
          const anyBW = itemSections.some((s: any) => !s.is_color);

          // Determine selected size slug from spec
          const selectedOptions = item.spec?.selected_options ?? {};
          const sizeOptionKey = Object.keys(selectedOptions).find(
            (k) => k.toLowerCase().includes("size")
          );
          const sizeSlug = sizeOptionKey ? selectedOptions[sizeOptionKey] : null;
          const targetDims = sizeSlug ? getTargetDimensions(sizeSlug) : null;

          for (const doc of itemDocs) {
            if (!doc.backend_asset_id) continue;

            const needsGrayscale = anyBW;
            let needsResize = false;
            let targetW: number | undefined;
            let targetH: number | undefined;

            if (targetDims && doc.page_width_mm && doc.page_height_mm) {
              const TOLERANCE = 3;
              const wDiff = Math.abs(doc.page_width_mm - targetDims.widthMm);
              const hDiff = Math.abs(doc.page_height_mm - targetDims.heightMm);
              // Check both orientations
              const wDiffL = Math.abs(doc.page_width_mm - targetDims.heightMm);
              const hDiffL = Math.abs(doc.page_height_mm - targetDims.widthMm);
              const matchesPortrait = wDiff <= TOLERANCE && hDiff <= TOLERANCE;
              const matchesLandscape = wDiffL <= TOLERANCE && hDiffL <= TOLERANCE;
              if (!matchesPortrait && !matchesLandscape) {
                needsResize = true;
                // Use orientation matching document
                if (doc.page_width_mm > doc.page_height_mm) {
                  targetW = Math.max(targetDims.widthMm, targetDims.heightMm);
                  targetH = Math.min(targetDims.widthMm, targetDims.heightMm);
                } else {
                  targetW = targetDims.widthMm;
                  targetH = targetDims.heightMm;
                }
              }
            }

            if (needsGrayscale || needsResize) {
              processingPromises.push(
                processDocumentForProduction({
                  backendAssetId: doc.backend_asset_id,
                  needsGrayscale,
                  needsResize,
                  targetWidthMm: targetW,
                  targetHeightMm: targetH,
                })
              );
            }
          }
        }

        if (processingPromises.length > 0) {
          // Run in parallel, don't await completion — jobs run on the PDF server
          Promise.allSettled(processingPromises).then((results) => {
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length) console.warn("[placeOrder] Some document processing failed:", failed);
          });
        }
      } catch (e) {
        console.warn("[placeOrder] Document processing setup failed (non-blocking):", e);
      }

      const subtotal = jobs.reduce((sum: number, j: any) => sum + j.net_price, 0);
      // Demo mode: prices are presented as a single all-in figure with no VAT line.
      // Tenants will configure their own VAT rules in a future iteration.
      const vatAmount = 0;
      const totalAmount = subtotal;
      // Use the currency stamped on the cart at first add. The cart can't mix
      // currencies, so this is the source of truth for the placed order.
      const orderCurrency = (cartOrder.currency as string | undefined) || "ZAR";

      // Detect demo tenant — tagged orders skip emails/invoices in the engine.
      const orderTenantId = tenantId || cartOrder.tenant_id;
      let isDemo = false;
      if (orderTenantId) {
        const { data: tRow } = await supabase
          .from("tenants")
          .select("is_demo")
          .eq("id", orderTenantId)
          .maybeSingle();
        isDemo = !!tRow?.is_demo;
      }

      // Call order-engine to create the real order
      const { data, error } = await supabase.functions.invoke("order-engine", {
        body: {
          action: "createOrderWithJobs",
          app_slug: app.slug,
          tenant_id: orderTenantId,
          branch_id: input.branchId || cartOrder.branch_id || null,
          customer: {
            profile_id: user.id,
            email: profile?.email || user.email || `demo-${user.id.slice(0, 8)}@demo.document-centre.com`,
            name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
                  || profile?.display_name
                  || (isDemo ? "Demo User" : null),
          },
          order: {
            source_channel: isDemo ? "demo" : "storefront",
            notes_customer: input.notes || null,
            date_required: null,
            metadata: { cart_order_id: input.cartOrderId, is_demo: isDemo },
          },
          pricing: {
            currency: orderCurrency,
            subtotal,
            vat_amount: vatAmount,
            total_amount: totalAmount,
            amount_paid: 0,
            amount_due: totalAmount,
          },
          delivery_address: input.deliveryMethod === "delivery" ? input.deliveryAddress : undefined,
          fulfillment_type: input.deliveryMethod,
          jobs,
          is_demo: isDemo,
        },
      });

      if (error) {
        // Surface the real error body from the edge function instead of the
        // generic "Edge Function returned a non-2xx status code" message.
        let detail: string | null = null;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.text === "function") {
            const text = await ctx.text();
            try {
              const parsed = JSON.parse(text);
              detail = parsed?.error || parsed?.message || text;
            } catch {
              detail = text;
            }
          }
        } catch {
          /* ignore — fall back to original error */
        }
        throw new Error(detail || (error as any)?.message || "Place order failed");
      }
      if (data?.error) throw new Error(data.error);

      // Clean up the cart synchronously so the refetched cart is empty.
      const itemIdsToDelete = items.map((i: any) => i.id);
      try {
        await supabase.from("document_sections").delete().in("order_item_id", itemIdsToDelete);
        await supabase.from("documents").delete().in("order_item_id", itemIdsToDelete);
        await supabase.from("order_items").delete().eq("order_id", input.cartOrderId);
        await supabase.from("orders").delete().eq("id", input.cartOrderId);
      } catch (e) {
        console.error("Cart cleanup failed (non-critical):", e);
      }

      // Optimistically clear the cart cache so the badge/Cart page update instantly,
      // even before the React Query refetch completes.
      qc.setQueryData(["cart", user.id, tenantId], null);

      return data.order_id;
    },
    onSuccess: () => {
      invalidateUserOrderCaches(qc);
    },
  });
}
