import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Get or create the user's single open cart order (order_status = 'cart').
 * Multiple order_items accumulate on this one order until checkout.
 */
export function useCart() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cart", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Find existing cart order
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, product_families:product_family_id(name, slug, icon))")
        .eq("user_id", user.id)
        .eq("order_status", "cart" as any)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
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
async function getOrCreateCartId(userId: string, tenantId: string | null, appId: string | null): Promise<string> {
  // Try to find existing cart
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
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

      // Get user's tenant membership
      const { data: membership } = await supabase
        .from("tenant_memberships")
        .select("tenant_id, app_id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      let tenantId = membership?.tenant_id ?? null;
      const appId = membership?.app_id ?? null;
      if (!tenantId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", user.id)
          .single();
        tenantId = profile?.tenant_id ?? null;
      }

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
        // Delete sections, documents, storage files for the replaced item
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
 * Returns the new draft order ID so the caller can navigate to the build page.
 */
export function useEditCartItem() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderItemId, cartOrderId }: { orderItemId: string; cartOrderId: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Get user's tenant membership
      const { data: membership } = await supabase
        .from("tenant_memberships")
        .select("tenant_id, app_id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      let tenantId = membership?.tenant_id ?? null;
      const appId = membership?.app_id ?? null;
      if (!tenantId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", user.id)
          .single();
        tenantId = profile?.tenant_id ?? null;
      }

      // Get the original cart item details
      const { data: sourceItem, error: srcErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("id", orderItemId)
        .single();
      if (srcErr || !sourceItem) throw srcErr ?? new Error("Item not found");

      // Create a new temporary draft order, storing the source cart item ID in metadata
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

        // Clone document sections, mapping old doc IDs to new ones
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

      // Cart total stays unchanged since we didn't remove anything

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
 * Remove an item from the cart. Deletes associated documents, sections, storage files.
 */
export function useRemoveCartItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderItemId, cartOrderId }: { orderItemId: string; cartOrderId: string }) => {
      // Get documents for cleanup
      const { data: docs } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("order_item_id", orderItemId);

      const docIds = docs?.map((d) => d.id) ?? [];
      const filePaths = docs?.map((d) => d.file_path).filter(Boolean) ?? [];

      // Delete sections
      await supabase.from("document_sections").delete().eq("order_item_id", orderItemId);

      // Delete documents
      await supabase.from("documents").delete().eq("order_item_id", orderItemId);

      // Remove storage files
      if (filePaths.length > 0) {
        const { deleteFromS3 } = await import("@/lib/s3Storage");
        await deleteFromS3(filePaths);
      }

      // Delete the order item
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
 * Place the order: transitions cart → confirmed, records submission timestamp.
 */
export function usePlaceOrder() {
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
      // Update order with checkout details
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          order_status: "confirmed" as any,
          fulfillment_type: input.deliveryMethod as any,
          notes_customer: input.notes || null,
          submitted_at: new Date().toISOString(),
          ...(input.branchId ? { branch_id: input.branchId } : {}),
        })
        .eq("id", input.cartOrderId);
      if (orderError) throw orderError;

      // Save delivery address if provided
      if (input.deliveryMethod === "delivery" && input.deliveryAddress) {
        const { error: addrError } = await supabase
          .from("order_addresses")
          .insert({
            order_id: input.cartOrderId,
            address_type: "delivery",
            ...input.deliveryAddress,
          });
        // Address insert may fail if RLS doesn't allow — log but don't block
        if (addrError) console.warn("Could not save delivery address:", addrError);
      }

      return input.cartOrderId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["all_orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
