# Wire Business Cards rate card into the product family

The Business Cards rate card (250 / 500 / 1000, single/double, paper, finish) is fully built under **Master Pricing → Business Cards**, and `calculatePrice.ts` already has a `business_cards` engine branch that reads `rate_card_business_cards` using the customer's selected `Pack Size`, `Print Sides`, `Paper Stock`, and `Lamination`. Two things are missing in the admin so the product can actually be built:

1. The product family has no way to tell the pricing engine it's a Business Cards product (`product_families.pricing_engine`).
2. The Options editor only offers Manual, Sizes, Papers, Finishing, and Print Attributes as sources — there is no source that pulls values from the Business Cards rate card. So you can't add a customer-facing **Pack Size** option (and similar) and have it stay in sync with the rate card.

## What changes

### 1. Pricing engine selector on the product family (Platform → Products)

Add a "Pricing engine" dropdown to `src/components/admin/ProductFamilyForm.tsx` with three choices:

- **Click charges** (default — booklets, flyers, posters, brochures, etc.)
- **Photo prints** (existing)
- **Business cards** (uses the Business Cards rate card)

Saves to the existing `product_families.pricing_engine` column. When set to **Business cards**, the OrderBuild / PriceSummary path that's already wired up will start pricing from `rate_card_business_cards`.

### 2. New option source: "Business Cards Rate Card"

Extend `src/components/admin/ProductOptionsEditor.tsx`:

- Add `rate_card.business_cards` to `SOURCE_OPTIONS`, labelled **Business Cards Rate Card (Master Pricing)** with a link to `/admin/master-pricing`.
- When that source is picked, show a small **Axis** dropdown next to it:
  - **Pack Size** → values from `DISTINCT quantity` (e.g. 250 / 500 / 1000), each value carries `metadata.quantity = N` so `calculatePrice.ts` reads it correctly.
  - **Print Sides** → Single / Double (from `DISTINCT sides`).
  - **Paper Stock** → from `DISTINCT paper`.
  - **Lamination** → from `DISTINCT finish` (None / Gloss / Matt / Soft-touch), mapped to the same labels the engine already recognises.
- Mirror behaviour (catalog refresh, manual fallback) reuses the existing `catalog.papers` / `catalog.print_attrs` plumbing — no new tables.

The values are read from the active scope's `rate_card_business_cards` rows via a small fetch added next to the existing `catSizes` / `catPapers` queries in `ProductOptionsEditor.tsx`. Inactive rows are excluded.

### 3. Seed the Business Cards family

One-line helper (admin button on the family's Options tab, "Auto-add rate card options") that creates the four options above with sensible defaults, so the user doesn't have to add them by hand. Existing options aren't touched.

## Out of scope

- No changes to `calculatePrice.ts` — the `business_cards` branch already consumes these exact option names.
- No schema changes; `rate_card_business_cards` and `product_families.pricing_engine` already exist.
- Photo Prints wiring (separate engine) is not touched.

## Verification

1. Platform → Products → Business Cards → set Pricing engine to **Business cards**, save.
2. Options tab → click **Auto-add rate card options** → Pack Size, Print Sides, Paper Stock, Lamination appear, populated from the rate card.
3. Build a Business Cards order: 500 / Double / 350gsm Silk / Matt lam → price equals the matching `rate_card_business_cards.sell_price` row, with no fall back to click charges.
4. Toggle a rate card row inactive → its value disappears from the customer dropdown on next load.
