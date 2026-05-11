## Goal

Rate Card → Recipe → Product. Every priced product reads from `rate_card_*` tables via its `product_recipes.recipe`. No more legacy `pricing_rules`/`product_price_overrides` UI surface. Photo Prints reads from `rate_card_photo_prints`.

## 1. Auto-seed default recipes

New helper `src/lib/seedDefaultRecipes.ts`:

- Loads master rate-card papers + finishing once.
- For every active master `product_families` row that has **no** `product_recipes` entry, derives a sensible default and inserts it.
- Heuristics keyed off `slug`:
  - `bound-document` / `notebook` → `uses_click_charges: true`, all bond+silk papers, finishing = bind/comb/wire/spiral/saddle-stitch + lamination cover.
  - `loose-sheets` / `flyers` / `letterheads` → click on, all bond+silk papers, finishing = trim, optional lamination.
  - `posters` → click on (large-format papers if present, else A3), no binding.
  - `business-cards` → click on, 350gsm+ papers, finishing = corner round / lamination.
  - `brochures` → click on, silk papers, finishing = fold + trim.
  - `photo-prints` → `uses_click_charges: false`, recipe just tags `engine: "photo_prints"` (see §3).
  - Unknown slugs → click on + every active paper, no finishing required.
- Idempotent: skips families already with a recipe.

Surfaced as a button on `AdminProducts.tsx` ("Seed default recipes") next to Seed All Products. Called once automatically when a freshly-seeded family is created.

## 2. Extend the rate-card calculator

`src/lib/calculatePrice.ts → calculatePriceFromRateCard`:

- Read `size` from `spec.selected_options.size` with broader fallback (`A4|A3|SRA3|A5|A6|DL|BC`). Match on free-text size now that `rate_card_clicks.size` is text.
- Add a **Photo Prints branch** when `recipe.engine === "photo_prints"`:
  - Read `size_slug`, `finish`, `border_mm` from spec.
  - Look up matching `rate_card_photo_prints` row; multiply by `quantity`.
  - Skip click/paper/finishing entirely.
- Extend `RateCardBundle` with `photoPrints: RateCardPhotoPrint[]`.

## 3. Photo Prints lookup module

`src/lib/photoPrints/pricing.ts` (new):

- `function resolvePhotoPrintPrice(rows, { size_slug, finish, border_mm }): number | null` — matches against rate-card rows; falls back to `PHOTO_PRINT_SIZES[*].unit_price` if no match (so dev keeps working before tenant clones).
- `PhotoPrintsBuilder.tsx` and `PhotoPrintsAdminGallery.tsx` swap their `size.unit_price` reads for this lookup, fed by `useRateCardPhotoPrints({ scope: "tenant", tenantId })`.
- `OrderBuild` already feeds `recipe + rateCard` to `PriceSummary`; nothing to change there beyond passing `photoPrints` rows through the bundle.

## 4. Recipe tab improvements

`ProductRecipeTab.tsx`:

- Add an "Engine" radio at the top: **Click charges** (default) / **Photo prints**.
- When engine = `photo_prints`, hide the papers + finishing pickers, show a read-only note linking to Master Pricing → Photo Prints.
- Persist as `recipe.engine: "click_charges" | "photo_prints"`.

## 5. Remove legacy pricing tab

- Delete `src/components/admin/ProductPricingTab.tsx`.
- Drop the `<TabsTrigger value="pricing">` and `<TabsContent>` block from `AdminProducts.tsx`. Remaining tabs: Options, Recipe.
- Delete unreferenced files if any: `useProductPriceOverrides.ts` is still consumed by the legacy calculator path — keep the hook + table, but stop surfacing it in Admin UI.
- Keep `calculateItemPrice` (legacy fn) only as a fallback for product families without a recipe yet; once auto-seed runs, every family has one and the legacy branch is dormant. We do **not** delete the legacy fn this pass to avoid breaking carts that referenced it.

## 6. Files

**New**
- `src/lib/seedDefaultRecipes.ts`
- `src/lib/photoPrints/pricing.ts`

**Edited**
- `src/lib/calculatePrice.ts` — photo-prints branch + bundle extension + free-text size matching
- `src/hooks/useProductRecipe.ts` — add `engine` field to `ProductRecipe` interface
- `src/components/admin/ProductRecipeTab.tsx` — engine selector + conditional UI
- `src/pages/admin/AdminProducts.tsx` — remove Pricing tab, add "Seed default recipes" button
- `src/pages/dashboard/OrderBuild.tsx` — include `useRateCardPhotoPrints` in the rate-card bundle
- `src/pages/dashboard/PhotoPrintsBuilder.tsx` — read price via `resolvePhotoPrintPrice`
- `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` — same

**Deleted**
- `src/components/admin/ProductPricingTab.tsx`

## Out of scope

- Branch-level photo-print overrides.
- Quantity-tier discounts on the rate card.
- Removing `PHOTO_PRINT_SIZES` constants (still used for crop aspect / DPI thresholds).
- Removing `pricing_rules` / `product_price_overrides` tables and their hooks.
