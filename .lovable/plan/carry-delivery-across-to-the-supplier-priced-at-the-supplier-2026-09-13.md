# Carry delivery across to the supplier, priced at the supplier's own rates

Order 27EDIT-13001 went across to Impress Print as CAL-26001 at the R1,840 trade price — but with no delivery charge at all (the copied order shows R0 delivery) even though the customer order is a courier delivery of R208.73. The delivery address *is* already copied across; the charge is not.

## What changes

1. **The copied order gets its own delivery charge**, worked out from Impress Print's delivery zones and weight bands — not from what The 2027 Edition charged the customer. The buyer stays free to charge the customer more (or less); the two figures are independent.
2. **The delivery address keeps coming across** as it already does, and the copied order is clearly marked as a delivery (not collection), with the zone and service shown on it.
3. **If the supplier has no rate for that address or weight**, the copied order is created with zero delivery and a visible note on it ("delivery not priced — supplier has no rate for this address/weight"), so nobody assumes carriage is included.
4. **Collection orders** stay at zero delivery on the supplier side.
5. **On the buyer's order**, staff can see what the supplier is charging for carriage alongside what was charged to the customer, so the true margin on the job is visible. Customers never see any of it.

## Weight

The supplier's bands are priced by weight, so the copy needs a weight. In order of preference:

1. the billable weight the customer's own quote used (recorded at checkout from now on),
2. the weight stamped on the order lines,
3. the weight recalculated from the line specifications,
4. failing all of those, the minimum billable weight, with the order flagged as "weight estimated".

Existing orders have no stored weight, so 27EDIT-13001 will be priced from the recalculated/estimated route when it is re-run.

## Technical notes

- `orders.delivery_amount` is the field; the mirrored order currently sets subtotal/total from job trade prices only.
- In `supabase/functions/_shared/supplier-mirror.ts`, after building the group and before inserting the mirror order: when `fulfillment_type <> 'collection'` and a delivery address exists, call `resolve_delivery_zone(p_tenant_id := supplier_tenant_id, p_branch_id := null, city/postcode/province/country)` then `quote_delivery_rate(p_tenant_id := supplier_tenant_id, p_branch_id := null, p_zone_id, p_method_id := null, p_billable_kg, p_currency)`. Impress Print has a tenant-level "South africa" zone with 17 bands, so the tenant-scope lookup resolves.
- Add the result to the mirror insert: `delivery_amount`, and `metadata.shipping = { amount, currency, zone_code, method_code, billable_kg, source }`; include it in `total_amount`/`amount_due` alongside the job subtotal. Record `metadata.supplier_delivery_unpriced = reason` when no rate matches.
- Weight resolution helper inside the mirror: `metadata.shipping.billable_kg` on the source order → `sum(order_jobs.weight_kg)` → per-line spec calculation mirroring `resolveItemWeight` rules → `max(minBillableKg, 1)`. Packaging/min-kg settings resolve against the *supplier* tenant via `resolve_branch_setting`/`resolve_tenant_setting`.
- Checkout/order-engine: persist `billable_kg` (and method id) into `orders.metadata.shipping` at submit, so future orders skip the estimate path. `metadata.shipping` currently holds only `amount`, `currency`, `method_code`, `zone_code`.
- Buyer-side visibility: show the supplier's carriage on the admin order's supplier panel next to the trade cost; no customer-facing change.
- Backfill: re-run the delivery pricing for CAL-26001 (`89e4f03f-8317-46f7-beb3-96b7a6946f05`) and update its delivery/total in place.
