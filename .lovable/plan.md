## Problem

Finishing groups like **Stapling**, **Hole Punching**, **Folding**, and **Binding** currently only offer chargeable choices — the customer has no way to pick "none". Lamination already works correctly because the master catalog has a `lam-none` row that the option adapter promotes to the default.

## Fix (two layers, so it works everywhere)

### 1. Seed "None" rows into `catalog_finishing` (source of truth)

Add one row per optional finishing category, following the existing `lam-none` convention that `optionAdapter.finishingRowsToValues` already recognises:

| category      | code            | label         | metadata          |
| ------------- | --------------- | ------------- | ----------------- |
| stapling      | staple-none     | None          | `{ none: true }`  |
| hole_punching | hole-punch-none | None          | `{ none: true }`  |
| folding       | fold-none       | None (flat)   | `{ none: true }`  |
| binding       | bind-none       | None (loose)  | `{ none: true }`  |
| collating     | collate-none    | None          | `{ none: true }`  |
| packaging     | pack-none       | None          | `{ none: true }`  |
| trimming      | trim-none       | None          | `{ none: true }`  |

- `is_active = true`, `pricing_basis = 'per_document'`, `sort_order = 0`.
- No price rows created — headline price falls to 0.
- Migration is idempotent (`ON CONFLICT DO NOTHING` on `(category, code)` — after ensuring the partial unique index exists per current schema).
- Backfill the corresponding branch/tenant inherited rows via the existing `ensure_branch_pricing_seeded` / seeding trigger so every branch immediately sees "None" in its rate card.

The adapter's existing `noneIndex` detection then makes "None" the seeded default for each of these groups automatically — no adapter changes needed.

### 2. Render-time safety net in `OptionsPanel.tsx`

For groups whose values array comes from **manual** `product_options.values` (not the catalog) — e.g. the legacy Stapling / Hole Punching / Fold Type / Binding rows shown in the DB check — synthesise a leading "None" entry (slug `<category>-none`, price 0, `is_default` when no other default exists) whenever:

- the option is not marked `is_required`, AND
- the values array does not already contain a none-like slug/label.

This means the fix works even for products still on manual values, without a data migration touching every product family's JSON.

Pricing engine impact: selecting the synthetic "None" slug already resolves to `price_impact = 0` in both `calculateItemPrice` and `calculatePriceFromRateCard`, so no pricing code changes are required. Preview/render code that keys off slugs like `staple-corner` continues to work — "None" simply doesn't match any effect and renders as a plain document.

### 3. Admin visibility

In the master pricing / rate-card editors, the seeded "None" rows appear as read-only 0-price entries alongside the chargeable ones, so admins can confirm the option is on offer. No new UI needed — the existing catalog list will show them.

## Out of scope

- No changes to Lamination / Cover Lamination (already correct).
- No changes to catalog categories that are inherently required (e.g. **Paper**, **Size**, **Print colour**, **Sides**).
- No pricing/preview refactors.

## Verification

1. Run the migration; confirm the 7 new `catalog_finishing` rows exist and are inherited into a test branch.
2. Open the Stapled & Loose Pages configurator (screenshot in the report): Stapling dropdown should now list **None** (default), Corner Staple (+R 1,50/doc), Double Staple Edge (+R 2,50/doc).
3. Same check for Hole Punching, Folding, Binding on their respective product families.
4. Confirm price for a plain single-sided A4 with all finishing set to "None" matches the base click+paper cost with no finishing surcharge.
