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
async function getOrCreateCartId(userId: string, tenantId: string | null): Promise<string> {
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

      // Get user's tenant_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      const cartId = await getOrCreateCartId(user.id, profile?.tenant_id ?? null);

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
          await supabase.storage.from("document-uploads").remove(oldPaths);
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

      // Get user's tenant_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      // Create a new temporary draft order
      const { data: draftOrder, error: draftErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          tenant_id: profile?.tenant_id ?? null,
          order_status: "draft" as any,
          total_price: 0,
        })
        .select("id")
        .single();
      if (draftErr) throw draftErr;

      // Move the order item to the draft order and set back to building
      const { error: moveErr } = await supabase
        .from("order_items")
        .update({ order_id: draftOrder.id, build_status: "building" as any })
        .eq("id", orderItemId);
      if (moveErr) throw moveErr;

      // Move linked documents
      await supabase
        .from("documents")
        .update({ order_item_id: orderItemId } as any)
        .eq("order_item_id", orderItemId);

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
        await supabase.storage.from("document-uploads").remove(filePaths);
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
