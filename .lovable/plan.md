## Why the current change isn't landing

The orders list already gets a red left border and a red "N new messages" pill for any placed order with unread messages — and the unread RPC is returning data (verified: `INV-00054` has 1 unread message for the signed-in user). Either:

- the highlight is too quiet to read as "this is the one", or
- the bell currently dumps you on the orders list with no pointer at all.

You explicitly said: "I cannot see which order that notification pertains to." So the real fix is to make the bell itself tell you which orders, not lean on highlighting in a long list.

## Plan

### 1. Turn the bell into a popover (`MessagesBell.tsx`)

Replace the plain `Link` with a shadcn `Popover`:

- Trigger: same bell + red count badge as today.
- Content: a small panel listing each order with `unread > 0`, sorted by unread count desc.
- Each row shows: order number, status pill, and an `N new` chip — clicking the row navigates straight to `orders/:id` (the order detail, not the list).
- Footer link: "View all orders" → `tenantPath("orders")` (current behaviour preserved).
- Empty state: "No new messages" (so the popover still works if a user clicks an unbadged bell).

Data source is the existing `useUnreadMessagesCustomer()` map. To render order numbers + status in the popover, extend the RPC return slightly OR do a one-shot fetch of `orders(id, order_number, customer_status)` for the IDs in the map. Prefer the second — no migration, keeps the RPC tight.

### 2. Keep the orders-list highlight, but make it louder

The current `border-l-4 border-l-red-500 bg-red-50/40` is genuinely too subtle on a long list. Bump it to:

- Full-card ring: `ring-2 ring-red-500 ring-offset-2`
- Stronger tint: `bg-red-50` (drop the `/40`)
- Pill stays as-is (already prominent)

Sort-to-top behaviour stays.

### 3. Deep-link from bell click

When a row in the popover is clicked, navigate to `tenantPath(\`orders/\${orderId}\`)` and close the popover. This is the single most direct answer to "which order does the notification pertain to" — the user never has to scan the list.

## Out of scope

- No DB migration; no changes to `get_unread_message_counts_for_customer`.
- No changes to staff bell / branch orders page.
- No realtime channel changes — existing per-instance suffixes stay.

## Files touched

- `src/components/customer/MessagesBell.tsx` — rewrite as Popover with order list.
- `src/pages/dashboard/CustomerOrders.tsx` — strengthen the unread card styling (2-line change).
