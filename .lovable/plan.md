## Goal
Verify the New Product Wizard + `kind`-driven refactor didn't regress existing products (Flyers, Brochures, Booklets, Bound Documents, Business Cards, Pull-up Banners, Photo Prints, Posters).

## Audit steps

1. **DB backfill check** — Query `product_families` for any rows where `kind` is NULL or empty. For each, confirm `getFamilyKind()` slug fallback resolves to the correct template. Backfill via migration if any legacy row would misclassify.

2. **Configurator parity (`OrderBuild.tsx` + `OptionsPanel.tsx`)** — For each existing family, load its customer configurator and confirm:
   - Correct template branch fires (flat_sheet vs bound vs folded vs saddle vs business_card vs large_format vs photo_print).
   - Pack pricing still drives Flyers size/paper/qty dropdowns.
   - Bound documents still show binding + section editor.
   - Brochures still show fold options.
   - Business Cards still hit BC rate card.
   - Pull-up Banners still show variants (economy/exec).

3. **Preview parity (`PreviewPanel.tsx` via `KIND_TO_PREVIEW`)** — Confirm each family renders the same preview type it did before the swap. Compare against `inferPreviewTypeFromJob` output for a sample job of each kind. Fix any mapping gap in `KIND_TO_PREVIEW`.

4. **Pricing parity (`useItemPricing`)** — Spot-check one order per family (existing cart or quote) to confirm unit price and total match pre-change values. Focus on Flyers (pack pricing), Bound (imposition/parent sheet), Business Cards (BC rate card), Pull-up (variant pricing).

5. **Admin edit flow** — Open each existing family in the legacy `ProductFamilyForm` edit dialog and confirm fields still load/save (wizard didn't remove fields the editor still writes). Check `pack_pricing`, `variants`, `hero_image_url`, `kind` all round-trip.

6. **Advanced menu regression** — Confirm "Seed all products" and "Seed bound document" still function from the Advanced dropdown for tenants that need them.

## Deliverable
Short report per family: kind resolved, configurator OK, preview OK, price OK, admin edit OK. Any mismatch → targeted fix (backfill migration, mapping addition, or field restore) in the same turn.

## Technical notes
- Read-only checks via `supabase--read_query` for the kind backfill and sample pricing snapshots.
- Playwright a customer configurator page per family kind for visual verification.
- No schema changes expected unless step 1 finds NULL `kind` rows in production data.
