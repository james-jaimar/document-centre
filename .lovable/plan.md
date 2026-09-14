# Sample pack orders showing R0,00

## What's actually happening

Order 27EDIT-13004 was placed as a sample pack. The saved price record for it is correct — R495 — but the order itself reads R0,00.

Cause, confirmed from the code and the database:

- When a sample pack is placed, the system sets the price of each of the three items to zero, because the pack is one flat price rather than three item prices.
- The database then automatically recalculates the order total by adding up the item prices. Three zeros gives zero, and it overwrites the R495 that was just written.

So the flat R495 is written first and then immediately wiped by the automatic recalculation. Nothing is wrong with the R495 setting itself.

## The fix

1. Instead of relying on the order total alone, record the R495 as a named charge line on the order ("Sample pack — one of each, delivery included"). Charge lines are included in the automatic recalculation, so the total stays at R495 no matter how many times it recalculates.
2. Keep the three items at zero, so the basket and the job sheets still read as "included in the pack".
3. Leave delivery at zero and VAT handled exactly as it is now.
4. Repair the existing order 27EDIT-13004 so it shows R495 instead of R0,00.

## Technical notes

- `supabase/functions/order-engine/index.ts`, sample pack block (~line 542): after the order is inserted, insert an `order_adjustments` row for the pack price instead of depending on the `orders.subtotal`/`total_amount` values written at insert time. `public.sync_order_amounts` sums `order_jobs.net_price + order_adjustments.amount`, so the adjustment survives the `handle_order_jobs_after_write` trigger that currently zeroes the order.
- Compute the adjustment as the net amount (`price / (1 + tenantTaxFraction)`) and continue setting `vat_amount` / `delivery_amount` on the order row so the trigger's `subtotal - discount + delivery + vat` arithmetic lands on the configured gross price.
- Keep `job.net_price = 0` / `gross_price = 0` as today.
- Data repair: add the same adjustment row to order `59fc6aa0-3dc6-446d-94f6-4d019f5e75bd` and let `sync_order_amounts` recompute it.
- No change to eligibility, the sample pack settings, or checkout.
