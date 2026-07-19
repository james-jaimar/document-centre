## Goal
Let admins price each product variant (e.g. Economy / Executive pull-up banners) without leaving the product editor. Pricing stays in the existing `rate_card_clicks` table (single source of truth) — the family's Variants tab gains an inline editor that reads/writes those rows filtered to that family's sizes and linked variants.

## Current state (verified)
- `rate_card_clicks` already has a `variant_code` column and `resolveClickRate` in `src/lib/calculatePrice.ts` filters by it (variant-specific row wins, falls back to variant-less).
- `RateCardEditor` (Master / Branch pricing) supports adding rows with a variant. This works, but is disconnected from the product editor, so from the Variants tab there is no visible price and no way to add one.
- `ProductFamilyVariantsEditor` (Admin → Products → [family] → Variants) only toggles which variants apply + default. No pricing surface.

## Changes

### 1. New inline component: `VariantPricingMatrix`
Path: `src/components/admin/VariantPricingMatrix.tsx`

- Props: `productFamilyId`, `variantLinks` (from parent), `scope` (`master` for now — branch scope can be added later via the existing Branch Pricing page).
- Reads:
  - Sizes assigned to the family via `product_catalog_links` (existing hook / `catalog_sizes`).
  - `rate_card_clicks` rows matching those size codes + the linked variant codes (resolved via `useResolvedRateCardClicks` at master scope).
- Renders a compact matrix grouped by size, with rows per variant × (Colour × Sides) combinations that already exist, plus an "Add row" button per variant that opens the same Add-click-charge dialog pre-filled with the size + variant.
- Sell / Cost cells are inline-editable (same commit-on-blur pattern as `RateCardEditor`).
- Empty state per variant explains "No price yet — Add row" so the user immediately sees where to enter pricing.

### 2. Wire the matrix into the Variants tab
File: `src/components/admin/ProductFamilyVariantsEditor.tsx`

- After the existing variants checklist, render `<VariantPricingMatrix productFamilyId={...} variantLinks={links} />` when there is at least one linked variant.
- Keep the "manage under Platform → Master Pricing" hint as a secondary link for bulk edits.

### 3. Filter helper on Click Charges table
File: `src/components/pricing/RateCardEditor.tsx`

- Add a small "Variant" filter dropdown above the click-charges table (All / each variant / None) so bulk edits from Master/Branch Pricing can be narrowed. Purely client-side filter on the existing `clicks` array.

### 4. No schema, no RLS, no engine changes
`variant_code` already flows end-to-end (spec → resolver → pricing). Nothing to migrate.

## Out of scope
- Branch-scoped variant matrix inside the product editor (branches still use Branch Pricing → Click Charges with the new variant filter; can be lifted into a branch product editor later if wanted).
- Per-variant pack pricing (banners are click-charge priced, not pack-priced).
