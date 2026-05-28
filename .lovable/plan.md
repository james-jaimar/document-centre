## Why R 0,00 is showing

The order summary says "Delivery — Major Centre — R 0,00 — Collection from branch". That's the bug.

The tenant has three delivery methods registered against the Major Centre zone:
- Collection from branch — R 0 (flat, all weights)
- PostNet Courier — Standard — R 95 (0–1 kg) … R 450 (20–30 kg)
- PostNet Courier — Overnight — R 150 (0–1 kg) … higher

The checkout calls `quoteShipping` without a `methodId`, so `quote_delivery_rate` returns the cheapest matching rate — which is the R 0 collection rate. That rate should never be eligible when the customer chose "Delivery — Ship to your address".

## Fix

### 1. Mark methods as shipping vs collection (DB)
Add `fulfillment_kind text not null default 'shipping'` to `public.delivery_methods` (check constraint: `'shipping' | 'collection'`). Backfill the tenant's "Collection from branch" method (code `collection`) to `'collection'`.

### 2. Update `quote_delivery_rate`
When the caller does not specify a method, only consider methods where `fulfillment_kind = 'shipping'`. When the caller does specify a method, respect it as-is. No signature change.

### 3. Surface method choice in checkout (UI only)
On the Checkout page, when "Delivery" is selected and the address resolves to a zone, fetch the available shipping methods + per-method price for the billable weight and render a small radio list:

```
Delivery option
( ) PostNet Courier — Standard ............ R 115,00
(•) PostNet Courier — Overnight ........... R 180,00
```

Default to the cheapest shipping method. The Order Summary line updates from the selected method (label + price). Pass the chosen `methodId` into `quoteShipping`.

To power that list, add a tiny helper `listShippingQuotes({ tenantId, branchId, zoneId, billableKg, currency })` in `src/lib/delivery/quoteShipping.ts` that queries `delivery_methods` (kind = shipping, active, scope cascade) and calls `quote_delivery_rate` once per method.

### 4. Verification
- Kloof / 3624 / KZN → zone resolves to Major Centre → checkout shows Standard R 115 and Overnight R 180 → Place Order persists the chosen method + fee.
- Switching to Collection hides the delivery option list and zeros the fee.
- No changes to billable-weight floor (1 kg) or province selector — those stay as built.

## Out of scope
- Admin UI to manage `fulfillment_kind` (the migration sets it correctly; admin editor work can come later).
- Any change to zone resolver, rate seed data, or address schema.