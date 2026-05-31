## Show branch on customer order cards

Customers in a multi-branch tenant can place orders against different branches, but the orders list doesn't surface which branch each order belongs to.

### Changes (frontend only, `src/pages/dashboard/CustomerOrders.tsx`)

1. Extend the `useUserOrders` select to join the branch:
   `branch:branches!orders_branch_id_fkey(id, name)` (alongside existing relations).
2. In `PlacedOrderCard`, add a small branch chip next to the status pills, e.g. `📍 PostNet Sandton City`, only when `order.branch?.name` exists. Muted styling so it doesn't compete with status/unread chips.
3. In `DraftCard`, show the same branch chip in the meta row beside the date so customers can see which branch a draft is tied to.
4. No filter UI — just display. Multi-branch filtering can come later if needed.

No DB, RLS, or hook changes. No styling overhaul — reuse existing badge classes.
