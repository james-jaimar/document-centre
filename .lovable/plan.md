
# Customer post-order self-service

Give the customer a sensible "I just placed this order, let me change it" surface — until the branch approves the order. After approval, everything becomes a request to the branch.

## Rules (agreed)

- **Edit window**: open while `admin_status` is `new_order` or `under_review`. Locks the moment branch sets `approved` (or anything later) and for any job already in production.
- **Quantity**: auto re-price against the *current* rate card. Increase ⇒ generate a top-up payment link (same gateway used originally). Decrease ⇒ create a credit/refund-pending record for the branch to action.
- **Delivery flip**: Collect ⇄ Deliver allowed in-window. System re-quotes delivery using existing `quoteShipping` logic against the customer's saved address; difference handled the same way as qty (top-up or credit).
- **Cancel + refund (hybrid)**:
  - Unpaid → cancel immediately, no money moves.
  - Paid online, within edit window, no job started → auto-refund via gateway (Stripe refund API / PayFast refund endpoint).
  - Paid online, outside window or partial production → mark `cancelled` + `refund_pending`, branch handles in dashboard and clicks "Mark refunded".
  - EFT / on-account → always flag for branch (no auto refund possible).

## Customer-side UI

New **"Manage order"** panel on `CustomerOrderDetail.tsx`, only visible while editable:

```text
┌─ Manage this order ────────────────────────────┐
│  ⏱ You can change this order until the branch  │
│     approves it.                               │
│                                                │
│  [ Change quantities ]                         │
│  [ Switch to delivery / collection ]           │
│  [ Update delivery address ]                   │
│  [ Cancel order ]                              │
└────────────────────────────────────────────────┘
```

- **Change quantities** → reuse `ReorderReviewDialog` styling: per-job qty stepper + remove, live re-price preview, "Confirm changes" → returns `{ delta_amount, requires_payment, credit_amount }`.
- **Switch fulfillment** → toggle + address picker + live delivery quote + delta summary.
- **Cancel** → confirmation dialog with reason; shows refund treatment ("R450 will be refunded to your card automatically" / "Branch will arrange your refund").

After any change that requires a top-up, customer is handed straight to the existing PayFast/Stripe handoff (`redirectToHostedPayment`). Credits show as a `order_adjustments` row with negative amount + status `refund_pending`.

## Branch-side UI

On `BranchOrderDetail.tsx`, surface in the order header:
- Badge **"Customer edit in progress"** when a change request is mid-flight.
- Badge **"Refund outstanding — R xxx"** for any `refund_pending` adjustment, with a **"Mark refunded"** action that writes a `payments` row (negative) and clears the flag.
- Timeline events for every customer-side change.

## Backend (`supabase/functions/order-engine/index.ts`)

New actions, all guarded by `assertCustomerOwnsOrder` + `assertOrderEditable` (status check):

1. `customerUpdateJobQuantities({ order_id, job_overrides[] })`
   - Re-price each affected job against the current `resolveRateCard` for that branch.
   - Recompute order totals (`order_pricing_snapshots` rewritten — still the live order, not a snapshot lock yet because approval hasn't happened).
   - Diff `total_amount` against `total_paid`:
     - delta > 0 → create `order_payment_attempts` row, return `{ checkout_url }`.
     - delta < 0 → insert `order_adjustments` (credit, `status='refund_pending'`).
   - Emit `timeline_events` `customer_edited_quantities`.

2. `customerChangeFulfillment({ order_id, fulfillment_type, address_id? })`
   - Re-quote delivery via existing `quoteShipping` helper.
   - Update `orders.fulfillment_type`, `order_addresses` row, `delivery_amount`.
   - Same delta/top-up/credit logic as above.

3. `customerCancelOrder({ order_id, reason })`
   - If unpaid → set `cancelled`, done.
   - If paid online + in-window + no job past `new` → call new helper `refundPayment({ gateway, payment_id, amount })`:
     - Stripe: `stripe.refunds.create`.
     - PayFast: POST to `/refunds/<pf_payment_id>` with merchant creds (existing creds resolver).
   - Otherwise → set `cancelled` + insert `refund_pending` adjustment for branch.
   - Always notify branch via existing email outbox event `order_cancelled_by_customer`.

4. `markRefundCompleted({ adjustment_id })` (branch/admin only) — clears refund flag, inserts negative `payments` row.

## Helpers / shared code

- `src/lib/orders/editability.ts` — single source of truth `isCustomerEditable(order)` reused by UI + engine.
- `supabase/functions/_shared/refunds.ts` — `refundStripe` / `refundPayfast` wrappers used by both the new cancel path and the future "Mark refunded" automation.

## Out of scope

- Editing the *spec* of a job (paper, binding, page count). Too risky post-production-prep; stays admin-only.
- Partial cancel of individual jobs. Falls under "change quantities → remove line".
- Timing/scheduling changes — not in use today.
- Tenant-level refund policy configuration (flat hybrid rule for now; can be made per-tenant later if needed).

## Files touched

- New: `src/components/customer/ManageOrderPanel.tsx`, `ChangeQuantitiesDialog.tsx`, `ChangeFulfillmentDialog.tsx`, `CustomerCancelDialog.tsx`, `src/lib/orders/editability.ts`.
- Edit: `src/pages/dashboard/CustomerOrderDetail.tsx`, `src/pages/branch/BranchOrderDetail.tsx`, `src/lib/orders/mutations.ts`, `supabase/functions/order-engine/index.ts`.
- New: `supabase/functions/_shared/refunds.ts`.
- Migration: add `status` + `metadata` columns to `order_adjustments` (for `refund_pending` flag) if not already present.
