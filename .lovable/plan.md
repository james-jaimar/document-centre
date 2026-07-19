# Generic Product Variant layer

Adds a first-class "variant" concept to any product family so tiered SKUs (Pull-up Banner Economy vs Executive, future Roller Banner Standard/Premium, canvas Thin/Deep, etc.) share a single family, size list and option surface, but carry their own pricing and label.

The customer picks a variant like they'd pick a paper stock; the pricing engine looks up the variant-specific rate. No duplicated products, no hardware-as-paper fudges.

## Data model

New master-catalogue kind, mirroring how `catalog_papers` / `catalog_finishing` work.

```text
catalog_variants                       (master + tenant + branch scoped, like other catalogs)
  id, scope_type, scope_id
  code (e.g. 'economy' | 'executive')
  label ('Economy', 'Executive')
  description, sort_order, is_active

product_variant_links                  (which variants a family offers)
  id, product_family_id
  catalog_variant_id
  is_default boolean
  sort_order

rate_card_clicks.variant_code   TEXT NULL      -- optional discriminator on existing rate rows
rate_card_photo_prints.variant_code TEXT NULL
product_pack_pricing_overrides.variant_code TEXT NULL
```

`variant_code` is NULL for products that don't use variants (100% backwards compatible — every existing row keeps working). When a family HAS variants, the pricing lookup prefers a row matching the selected `variant_code`, falling back to the NULL row if none exists.

All new tables get GRANTs + RLS (master = public read, tenant/branch scoped writes via `has_role` / `tenant_memberships`), matching the existing catalog pattern.

## Admin surfaces

1. **Platform → Master Pricing → new "Variants" tab**
   Simple CRUD list of master variants (code, label, description, active). Ships with `economy` and `executive` seeded so pull-up banners work out of the box.

2. **Admin → Products → Edit Product Family → new "Variants" section**
   Multi-select of catalog variants to enable for this family + choose default. Empty = family has no variants (current behaviour).

3. **Master Pricing → Click Charges dialog** (the one in the screenshot)
   When the selected Size belongs to a family that has variants, show a **Variant** dropdown next to Colour/Sides. The row is saved with `variant_code`. Existing rows without variants keep working; the grid groups by variant.

4. **Pack Pricing editor** — same treatment: variant column appears only when the family has variants.

## Customer configurator

`OptionsPanel.tsx` gains a "Variant" selector (rendered from `product_variant_links`, styled like the size/paper selectors) whenever the family has variants. Selection is stored on the order item as `variant_code`.

`useItemPricing` / `calculatePrice` pass the selected `variant_code` into the rate lookups so Economy and Executive resolve to their own prices, with graceful NULL fallback.

`QuoteSpecBuilder` seeds the family's default variant (same pattern as the A4 dummy size) so spec quotes price correctly.

## Migration & rollout

- Schema migration creates the two tables, adds the three nullable `variant_code` columns, seeds `economy` + `executive` at master scope, and links them to any family flagged "banners". No existing pricing rows are touched.
- Backwards compatibility: every existing family has zero `product_variant_links` → variant selector hidden → engine behaves exactly as today.
- Pull-up banners: create the family, attach both variants, then add two click-charge rows (one per variant) at your Economy / Executive prices.

## Out of scope (call-outs)

- No changes to finishing/paper catalogues — variants are orthogonal.
- No automatic price deltas ("Executive = Economy × 1.4"). Each variant is priced explicitly, which matches how you price everything else.
- Reporting/analytics filters by variant can come later; the `variant_code` on order items makes it trivial when needed.

## Technical notes

- Files touched: new `catalog_variants` + `product_variant_links` hooks, `MasterCatalogVariantsEditor.tsx`, extend `RateCardEditor.tsx` + `MasterPackPricingEditor.tsx` + `PackPricingMatrixEditor.tsx`, `ProductFamilyEditor` (variants section), `OptionsPanel.tsx`, `PriceSummary.tsx`, `useItemPricing.ts`, `calculatePrice.ts`, `useOrderBuilder.ts` (persist `variant_code`), `QuoteSpecBuilder.tsx`.
- Order item persistence: add `variant_code TEXT NULL` to `order_items` and `quote_items` so the choice snapshots with the order (immutable pricing rule).
- All rate-card lookups become `WHERE ... AND (variant_code = $v OR (variant_code IS NULL AND NOT EXISTS variant-specific row))`.
