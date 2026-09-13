# Fix: paid outsourced order never reached Impress Print

Order 27EDIT-13001 (The 2027 Edition, A2 Deskpad Calendars, paid, approved) did not appear in Impress Print. Two separate faults, both confirmed against the live records.

## What went wrong

**1. The product wasn't recognised as outsourced.**
The trade partner link is active and the A2 Deskpad Calendars family is correctly marked as printed by Impress Print. But the copying step looks for the product's identifier in one place, and the order actually stores it in another (nested under the product details). So it found no outsourced items and stopped without doing anything — silently.

**2. Marking the order as paid never triggers the copy.**
The copy only runs when someone moves an order to Approved or In production through the status control, or when an account order is created. Recording a payment updates the payment fields only — it never calls it. This order was approved at creation and then paid, so the copy was never attempted at all.

**3. The trade cost on the job is zero.**
The order line carries no cost figure, so the copied order would have been valued at the 2027 Edition's selling price rather than Impress Print's trade price.

## The fix

- Read the product identifier from both possible locations, so existing and future orders are both recognised.
- Also run the copy when an order becomes fully paid, and when a held order is released after payment — still only once per order, so payment plus approval can't create duplicates.
- When the order line has no cost, price the copied order from the supplier's trade ladder for that quantity and specification, falling back to the selling price only if nothing matches.
- Record a note on the order when the copy is skipped or fails, so a silent nothing-happens can't recur.
- After the fix, run the copy once for order 27EDIT-13001 so it lands in Impress Print as a trade order against The 2027 Edition.

## Technical notes

- `supabase/functions/_shared/supplier-mirror.ts`: resolve family id as `product_snapshot.product_family_id ?? product_snapshot.product_family?.id`; when `cost_price` is 0, resolve the trade price via `supplier_trade_terms(link_id, supplier_family_id)` matched on the job's quantity/variant keys; log and persist a reason (`orders.supplier_status = 'skipped'` plus metadata) when no groups are found.
- `supabase/functions/order-engine/index.ts`: call `mirrorSupplierOrders` in `recordPayment` after the `payment_status: "paid"` update, and in the held-order activation path. Idempotency stays keyed on `orders.source_order_id`.
- Backfill: invoke `mirrorSupplierOrders` for `fc766fbc-14f1-49a5-9f5c-ae9037543a4d` after deploy and verify the new order exists in tenant `0befd2c2-5766-4174-b296-f9aa0221603a`.
