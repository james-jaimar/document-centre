# Supplier dispatch and waybill flow back to the buyer

When Impress Print dispatches a trade order, the waybill details must land on the matching The 2027 Edition order so the end customer is kept informed — without the customer ever seeing Impress Print.

## Current state (verified)

- A mirrored supplier order is created with `source_order_id` pointing back at the buyer's order, and the buyer's order records `supplier_order_id`, `supplier_link_id` and `supplier_status`.
- Marking an order dispatched already requires a tracking number and stores carrier, number and dispatch time on that order.
- Nothing reads `source_order_id` afterwards — supplier progress and waybill details never travel back. `supplier_status` is written at creation only.

## What we'll build

**On the supplier's order (Impress Print)**
- No new screen. They work the order as normal: In production → Sent to print → Ready → Dispatched, entering courier and waybill number at dispatch as they do today.
- The order shows a small "Trade order for The 2027 Edition" badge so staff know progress is being reported back.

**Flowing back to the buyer (The 2027 Edition)**
- Every status change on a supplier order updates the linked buyer order's supplier status, and pushes the buyer's own order forward to the matching stage.
- On dispatch, the courier name, waybill number and dispatch date copy onto the buyer's order.
- The buyer's customer then sees their order as dispatched with the waybill, and the normal dispatch email goes out from The 2027 Edition — its own branding, its own courier line, no mention of the supplier.
- The buyer's order timeline logs each supplier step as an internal-only note (staff see it, the customer doesn't).

**Guards**
- Buyer staff can still edit or override the waybill on their own order; a later supplier update won't overwrite a value the buyer typed.
- If the buyer's order has other, in-house items still in production, the supplier's dispatch is recorded and shown to staff but the order is not marked dispatched until everything is ready.
- Cancelling or holding on the supplier side is reported back as a flag for buyer staff, never an automatic cancellation.

## Technical notes

- In `order-engine` `updateOrderStatus`, after the order update: if the order has a `source_order_id`, load the buyer order and write `supplier_status = admin_status`; when `admin_status = 'dispatched'`, copy `tracking_number`, `tracking_carrier`, `dispatched_at` onto the buyer order only where the buyer's value is null, then recurse into the buyer order's own status transition (reusing the same transition path so emails, timeline and job rollups fire normally). Guard against loops with an explicit `propagated: true` flag so the buyer transition does not attempt to push back.
- Only advance the buyer order when every non-supplier `order_jobs` row is at or beyond the mapped stage; otherwise store the supplier status and add the internal timeline entry only.
- Timeline entries use `timeline_events` with `visibility = 'admin'` and metadata `{ supplier_order_id, supplier_status }`.
- The buyer's order detail gains a compact "Supplier progress" strip (staff-only) reading `supplier_status` plus the latest supplier timeline entry; the customer-facing order page is unchanged apart from the existing tracking block now being populated.
- Also backfill the reverse link on existing mirrored orders so already-live trade orders start reporting.
