import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate all caches related to a user's orders/documents/cart.
 * Call from every mutation onSuccess that touches orders, order_items,
 * documents, or cart state.
 */
export function invalidateUserOrderCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["cart"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["all_orders"] });
  qc.invalidateQueries({ queryKey: ["recent_documents"] });
  qc.invalidateQueries({ queryKey: ["recent_order_items"] });
  qc.invalidateQueries({ queryKey: ["tracking_orders"] });
}
