## Goal
Add quantity price-break tiers (1–99, 100–249, etc.) to the Variant Pricing matrix on the Product Family → Variants tab, matching the ladder editor already used on the Master / Branch Click Charges rows.

## Change

**File:** `src/components/admin/VariantPricingMatrix.tsx`

- Import `TiersButton` from `src/components/pricing/TiersButton.tsx`.
- Add a new column (`Tiers`) to each price row's table, rendering:
  ```tsx
  <TiersButton
    table="clicks"
    lineId={row.id}
    label={`${size.label} · ${row.colour} · ${row.sides} · ${vLabel}`}
    scope="master"
    tenantId={null}
    branchId={null}
    fallbackSell={row.sell_price}
    fallbackCost={row.cost_price}
  />
  ```

That's it — `PriceBreaksModal` + `useReplaceRateCardPriceBreaks` already handle the tier CRUD against `rate_card_price_breaks` for the `clicks` table, and `calculatePrice.ts` already resolves tiers via `resolveTier` for click charges. Branches inherit the master tiers the same way they inherit the base rate.

## Out of scope
- Tier editing at branch scope inside the product editor (branches still edit tiers via Branch → Pricing → Click Charges → Tiers icon).
- Schema changes — `rate_card_price_breaks` already supports `rate_card_table = 'clicks'` with `variant_code` scoped indirectly through the `rate_card_id` FK.
