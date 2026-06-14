# Wire products to master catalog & pricing

## The problem

The customer configurator (`/orders/new/:familyId` → `OrderBuild.tsx`) is **not** reading from the Master Catalogue / Master Pricing you've been editing. It's reading from the legacy `product_options` JSONB table.

What that means concretely:
- Adding a paper to **Master Catalogue → Papers** doesn't make it appear in the customer's paper picker.
- Adding an SRA3 price in **Master Pricing → Papers** has no effect on what the customer is charged.
- Toggling **Cover / SRA3-only** flags is invisible to the customer flow.
- Editing a finishing item's category/basis/size in **Master Pricing → Finishing** doesn't flow through.
- `branch_catalog_overrides` (the new branch override system) is dead from the customer's POV — only `branch_product_option_overrides` (legacy) is read.

Pricing engine has a second hidden disconnect: it only uses the new rate-card engine when **both** a `product_recipes` row and a non-empty `rate_card_clicks` table exist for the branch. Otherwise it silently falls back to legacy `pricing_rules`. Even in the new engine, missing finishing entries fall back to legacy `product_options.price_impact`.

## What to build

### 1. Replace the option-list source in `OrderBuild.tsx`

Swap `useResolvedProductOptions(productFamilyId, branchId)` for `useResolvedCatalogOptions(productFamilyId, branchId)` (the hook that already calls the `resolve_product_options` RPC — master ← product_catalog_links ← branch_catalog_overrides).

Build a small adapter (`src/lib/catalog/toProductOptions.ts`) that projects the RPC's rows into the `Tables<"product_options">[]` shape that `OptionsPanel` and `calculateItemPrice` expect:
- `catalog: "size"` → option group `size`, values from `catalog_sizes` rows (with metadata.iso, width_mm, height_mm).
- `catalog: "print_attr"` → grouped by `sub_attribute` (`color`, `sides`, …).
- `catalog: "paper"` → option group `paper`, with `metadata` carrying weight/finish/`is_cover_stock`/`is_edge_to_edge_only` so capability gates (cover, SRA3-only) work.
- `catalog: "finishing"` → option group `finishing` (or per-category groups: binding, lamination, …), values from `catalog_finishing` rows.

This adapter is the seam. `OptionsPanel` stays as-is.

### 2. Make pricing always use the catalog

In `calculatePriceFromRateCard` (and the dispatch in `PriceSummary.tsx`):
- Remove the `useNewEngine` gate. The new engine should always run when there's a recipe; missing pieces should warn loudly (a dev console warn + a UI "pricing not configured" badge) rather than silently fall back to `pricing_rules`.
- Remove the `product_options.price_impact` fallback inside `calculatePriceFromRateCard` (lines ~705-723). Prices come from `catalog_paper_prices` / `catalog_finishing_prices` only.
- For families with no recipe yet, keep the legacy path but surface a visible "Legacy pricing — please configure recipe" notice in admin/dev only (no behaviour change for end users on those families).

### 3. Retire the duplicate branch-override system (follow-up, flagged not done)

`branch_product_option_overrides` (legacy) and `branch_catalog_overrides` (new) both exist. After step 1, only `branch_catalog_overrides` matters. Plan a follow-up migration to: (a) one-time migrate any active legacy overrides into `branch_catalog_overrides`, (b) drop reads of the legacy table, (c) eventually drop the table.

### 4. QA matrix

Before shipping:
- Pick one product family with a configured recipe (e.g. bound documents). Confirm: sizes, papers, print attrs, finishing all appear from master catalogue; SRA3-only and Cover flags gate correctly; price equals master-pricing × quantity.
- Pick one family **without** a recipe. Confirm: it still loads (legacy path) and shows the dev-only "configure recipe" notice.
- Toggle a paper off in `branch_catalog_overrides`; confirm it disappears from the customer picker on that branch.

## Technical notes

- Files touched: `src/pages/dashboard/OrderBuild.tsx`, `src/components/order/PriceSummary.tsx`, `src/lib/calculatePrice.ts`, new `src/lib/catalog/toProductOptions.ts`. No schema migrations required for step 1+2.
- `resolve_product_options` RPC already returns `metadata`, `price_delta_minor`, `price_override_minor`, `is_enabled`, `is_default` — enough for the adapter.
- Keep `useProductOptions` around (admin editors still use it) but stop importing it in `OrderBuild`.
- The rate-card engine already reads `catalog_papers` / `catalog_finishing` directly, so no change needed there — only the gate and the fallback.

## Out of scope

- Touching admin/branch catalogue editors (already correct).
- Photo-prints flow (`rate_card_photo_prints`) — separate engine, separate review.
- Migrating/removing `branch_product_option_overrides` (flagged as follow-up).
- Any UI redesign of `OptionsPanel`.
