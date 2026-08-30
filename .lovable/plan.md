# Fix consumer/trade pack pricing inheritance

## Confirmed diagnosis

For A2 Deskpads, quantity 100:

- Master row: **Consumer R4,417.00**, **Trade R3,398.00** (ex VAT).
- Impress tenant override row: **Consumer R3,398.00**, with no trade value.
- The storefront resolves a signed-out visitor as `consumer`, then correctly reads the active override's `price_minor` field.
- R3,398.00 + 15% VAT = **R3,907.70**, exactly matching the reported guest price.

So the tier resolver is not selecting trade for the guest. The tenant override is shadowing the master ladder and contains the master trade figure in its consumer field.

## Changes

1. **Correct the Impress Deskpads override data**
   - Update its A2 Complete Deskpad rows so consumer and trade values match the intended master columns.
   - Preserve the tenant override record rather than deleting it, so any genuine tenant-specific configuration remains intact.

2. **Make override inheritance column-aware**
   - Resolve matching pack rows by scope (branch → tenant → master), but inherit consumer and trade values independently.
   - A tenant/branch row can override consumer, trade, or both; an omitted trade value falls back to the parent trade value, not to the overridden consumer value.
   - Keep the existing final fallback: if no trade price exists at any scope, trade uses consumer.

3. **Prevent stale override columns in admin**
   - In tenant and branch pack-pricing editors, show the effective inherited values for columns not explicitly overridden.
   - Clearly distinguish inherited values from locally overridden values, with the existing revert-to-parent action retained.
   - Saving must preserve both consumer and trade columns instead of flattening the active price into `price_minor`.

4. **Regression coverage and verification**
   - Add tests for guest/consumer, trade customer, tenant override, branch override, and missing trade-column fallback.
   - Verify A2 Deskpads quantity 100 on the Impress storefront:
     - signed out: **R5,079.55 incl. VAT** (R4,417.00 ex VAT),
     - trade customer: **R3,907.70 incl. VAT** (R3,398.00 ex VAT).
