## Problem

The customer messages bell lists every order with unread messages for the signed-in user across **all** tenants they belong to. In a multi-tenant storefront (e.g. signed in on PostNet but also a customer of another tenant), clicking a row sends them to `/t/postnet/.../orders/{id}` for an order that belongs to a different tenant. `CustomerOrderDetail.tsx` then correctly blocks it with "This order doesn't belong to this storefront."

The unread badge count has the same cross-tenant leak — it shows totals from foreign tenants too.

## Fix (frontend only)

Scope the bell to the **current tenant** in `src/components/customer/MessagesBell.tsx`:

1. Read `tenantId` from `useTenantContext()`.
2. In the orders-by-id query, also `select` `tenant_id` and filter the result to rows where `tenant_id === currentTenantId`. (Keep using the RPC as-is — it already returns the user's full unread map; we just trim it to this storefront.)
3. Derive the unread `total` (badge number) from the **filtered** rows, not from the raw RPC map, so the count matches what the popover actually shows.
4. Empty state copy stays "No new messages" — from the customer's point of view, there are none in this storefront.

No changes to:
- The RPC `get_unread_message_counts_for_customer` (still global; other tenants' bells will continue to work correctly when the user visits them).
- `CustomerOrders.tsx` (its query is already tenant-scoped via the orders list).
- Staff bell, realtime channels, routes, or RLS.

## Files touched

- `src/components/customer/MessagesBell.tsx` — add tenant filter + recompute total.
