## Make orders with new messages obvious

The unread badge already exists on order rows but is easy to miss in a long list. Two small changes in `src/pages/dashboard/CustomerOrders.tsx`:

### 1. Surface unread orders to the top
Sort `placedOrders` so any order with `unreadMap[order.id] > 0` appears first (preserving date order within each group). Coming from the bell, the user lands with the relevant order(s) right at the top of the list.

### 2. Make the row itself visually flag unread
On `PlacedOrderCard`, when `unread > 0`:
- Add a coloured left border + subtle tinted background (e.g. `border-l-4 border-l-red-500 bg-red-50/40`) so the whole card stands out, not just the small pill.
- Keep the existing "N new" message pill, but enlarge it slightly and place it more prominently next to the order number.

No data, RPC, or realtime changes — purely presentational tweaks to the existing `useUnreadMessagesCustomer` map already wired in.

### Out of scope
- Branch/staff order lists (can mirror the pattern later if you want).
- Deep-linking the bell to a specific order — staying with "bell → orders list, unread floats to top" since multiple orders can have messages.
