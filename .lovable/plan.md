Two fixes:

### 1. Completion email never sent
`order-engine` only triggers customer emails on `ready_for_dispatch` (collection) and `dispatched`. When admin marks an order `completed`, no email goes out, even though `send-order-email` already has a `completed` template ("Your order is complete").

**Fix:** In `order-engine/index.ts` (the `updateOrderStatus` case around line 1538), add a branch:
- `to === "completed"` → `eventKey = "completed"`

That's it — template, subject, body all already exist.

### 2. Reorder bypasses payment when card gateway is enabled
Today `reorderOrder` clones the source order and immediately creates a new submitted order with `amount_due = subtotal`. The customer lands on the order detail screen with no opportunity to pay by card, even if PayFast/Stripe is configured. Only an `order_received` email (with "pay via EFT" instructions) is sent.

**Fix (frontend, in `CustomerOrders.tsx` and `CustomerOrderDetail.tsx`):** After `reorderOrder` succeeds, check whether the current tenant/branch has any enabled online gateway (reuse the same query Checkout already uses against `tenant_payment_gateways` / `branch_payment_gateways`, filtering out PayFast when currency ≠ ZAR):

- **If at least one online gateway is enabled** → route the customer to `tenantPath("checkout?order_id={newOrderId}")` so they can pick payment method (card or EFT) exactly like a normal checkout. They keep the choice.
- **If no online gateway is enabled** → keep today's behaviour: navigate to the new order detail (EFT instructions already in the email).

**Checkout.tsx adjustment:** Currently Checkout builds a brand-new order from the cart at submit time. To accept an existing reordered order, add support for `?order_id=…`:
- When present, skip the cart-fetch / order-creation step and use that order ID as `newOrderId` for the address-save + payment-session-initiate flow.
- Hide the cart line-item editing UI (items already locked into the reordered order) and show a read-only summary pulled from the order. Shipping/billing addresses are already copied across by `reorderOrder`, so prefill from the order's addresses.

**No backend changes required for reorder.** The existing `payments-create-session` edge function works against any order_id, so the same flow Checkout uses for first-time orders will work for reorders.

### Files touched
- `supabase/functions/order-engine/index.ts` — add `completed` → email branch
- `src/pages/dashboard/CustomerOrders.tsx` — branch on gateway availability after reorder
- `src/pages/dashboard/CustomerOrderDetail.tsx` — same branching
- `src/pages/dashboard/Checkout.tsx` — accept `?order_id=` to resume payment for a pre-created order

### Out of scope
- Cancel order — confirmed working, no change.
- Marking notification/bell behaviour — no change.