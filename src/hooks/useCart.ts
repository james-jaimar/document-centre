import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildJobSnapshot } from "@/lib/orders/buildJobSnapshot";

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
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!tenantId) throw new Error("No tenant context");

      const cartId = await getOrCreateCartId(user.id, tenantId, appId);

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
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["all_orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
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
        const docInserts = docs.map((d) => ({
          order_item_id: clonedItem.id,
          file_name: d.file_name,
          file_path: d.file_path,
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
        }));
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
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["all_orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
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
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["all_orders"] });
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
                  "id, order_item_id, file_name, page_count, file_size, page_width_mm, page_height_mm, thumbnail_urls, sort_order"
                )
                .in("order_item_id", itemIds)
                .order("sort_order")
            : Promise.resolve({ data: [] as any[] }),
        ]);

      const { inferPreviewTypeFromJob } = await import("@/lib/orders/inferPreviewType");
      const { buildPreviewSnapshot } = await import("@/lib/orders/buildPreviewSnapshot");

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
        const previewType = inferPreviewTypeFromJob({
          product_category,
          product_snapshot,
        });

        // Full preview snapshot — bleed/covers/lamination/paper colour/tabs/inserts
        // resolved at place-order time so the read-only preview matches the
        // customer's chosen finishing options exactly.
        const selectedOptions = (item.spec?.selected_options ?? {}) as Record<string, string>;
        let previewSnapshot: any = { thumbnails, product_type: previewType };
        try {
          const snap = buildPreviewSnapshot({
            productType: previewType,
            selectedOptions,
            productOptions: familyOptions as any,
            sections: itemSections as any,
            documents: itemDocs as any,
          });
          // Prefer the snapshot's resolved per-page thumbnails (includes
          // tab/insert/cover blanks in the right physical positions).
          previewSnapshot = snap;
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
        };
      });

      const subtotal = jobs.reduce((sum: number, j: any) => sum + j.net_price, 0);
      const vatAmount = Math.round(subtotal * 0.15 * 100) / 100;
      const totalAmount = subtotal + vatAmount;

      // Call order-engine to create the real order
      const { data, error } = await supabase.functions.invoke("order-engine", {
        body: {
          action: "createOrderWithJobs",
          app_slug: app.slug,
          tenant_id: tenantId || cartOrder.tenant_id,
          branch_id: input.branchId || cartOrder.branch_id || null,
          customer: {
            profile_id: user.id,
            email: profile?.email || user.email,
            name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || null,
          },
          order: {
            source_channel: "storefront",
            notes_customer: input.notes || null,
            date_required: null,
            metadata: { cart_order_id: input.cartOrderId },
          },
          pricing: {
            currency: "ZAR",
            subtotal,
            vat_amount: vatAmount,
            total_amount: totalAmount,
            amount_paid: 0,
            amount_due: totalAmount,
          },
          delivery_address: input.deliveryMethod === "delivery" ? input.deliveryAddress : undefined,
          jobs,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Clean up the cart in the background — don't block navigation
      const itemIdsToDelete = items.map((i: any) => i.id);
      void (async () => {
        try {
          await supabase.from("document_sections").delete().in("order_item_id", itemIdsToDelete);
          await supabase.from("documents").delete().in("order_item_id", itemIdsToDelete);
          await supabase.from("order_items").delete().eq("order_id", input.cartOrderId);
          await supabase.from("orders").delete().eq("id", input.cartOrderId);
        } catch (e) {
          console.error("Cart cleanup failed (non-critical):", e);
        }
      })();

      return data.order_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["all_orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
