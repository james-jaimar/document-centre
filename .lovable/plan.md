## Problem

For the same spec (Bound Documents, comb binding, no covers, 80gsm bond, 40pp body, colour duplex), the customer configurator prices at **R124** but the spec-quote builder prices at **R71**. The two paths call different pricing engines with different inputs, so they cannot agree.

## Verified root causes (read from `OrderBuild.tsx` vs `QuoteSpecBuilder.tsx`)

The customer flow in `src/pages/dashboard/OrderBuild.tsx` does five things the quote builder skips:

1. **Rate-card engine selection.** When a `product_recipe` and rate cards exist, `OrderBuild` calls `calculatePriceFromRateCard(...)` instead of legacy `calculateItemPrice(...)`. `QuoteSpecBuilder` only ever calls the legacy calculator (line 282), so branch/tenant rate-card entries for clicks, paper, finishing and binding are ignored.
2. **Branch + tenant price overrides.** `OrderBuild` cascades `useProductPriceOverrides(tenant, family, currency, branchId)` and `(...null)` into the legacy calculator's 5th arg. `QuoteSpecBuilder` passes no overrides.
3. **Branch-scoped pricing rules.** `OrderBuild` filters `pricing_rules` by `effectiveBranchId` (falling back to tenant). `QuoteSpecBuilder` uses tenant-wide rules only.
4. **Section normalisation.** `OrderBuild` remaps section roles to canonical labels `"Cover" | "Back Cover" | "Body"` and filters printable sections; `QuoteSpecBuilder` sends whatever the admin typed in the label field (`s.label || s.role`), so the calculator's per-section rate lookups can miss.
5. **Tab dividers as spine-only sections.** `OrderBuild` appends zero-page `"Tab"` sections so binding spine calculations (comb/wire) size correctly. `QuoteSpecBuilder` doesn't — comb binding priced without tab bulk contribution.

Item 1 alone is enough to produce a R71 vs R124 gap for a tenant that publishes rate cards; items 2–5 compound it and cause silent drift as branches diverge.

## Fix

Refactor `QuoteSpecBuilder` to reuse the exact same pricing wiring `OrderBuild` uses. To keep it DRY, extract a shared hook and consume it from both places.

### 1. New shared hook `src/hooks/useItemPricing.ts`

Inputs: `{ tenantId, branchId, productFamilyId, currency, spec, options }`.
Loads (mirroring `OrderBuild` lines 143–210):

- `useProductPriceOverrides` for branch + tenant → `cascadedOverrides`
- `useDerivedProductRecipe(productFamilyId)` → `recipe`
- `useRateCardClicks/Papers/Finishing/PhotoPrints/BusinessCards` scoped to `{ tenantId, branchId }`
- `useBindingSpecifications`, `useRateCardPriceBreaksBundle`
- Branch-scoped `pricing_rules` query (same query key/logic as `OrderBuild`)

Returns `{ breakdown, useNewEngine, unitPrice, total }` computed via the same `useNewEngine && recipe && rateCard` branch that picks `calculatePriceFromRateCard` vs `calculateItemPrice`.

Then update `OrderBuild.tsx` and `PriceSummary.tsx` to consume it (structural refactor only, no behaviour change on the customer side — same inputs, same outputs).

### 2. Section normaliser `src/lib/quotes/normaliseQuoteSections.ts`

Pure function that turns the quote-builder `QuoteSection[]` into the same `ItemSpecSection[]` shape `OrderBuild` builds:

- Map role → canonical label: `front_cover → "Cover"`, `back_cover → "Back Cover"`, `body → "Body"`.
- Drop non-printable roles from the printable list.
- Append one zero-page `{ label: "Tab", page_count: 0, is_color: false, is_duplex: false }` per tab-divider row.
- (Single-sheet families aren't relevant to spec quoting yet — skip that branch.)

### 3. Wire `QuoteSpecBuilder` to the new hook

- Replace the local `usePricingRules` + `calculateItemPrice` block with `useItemPricing({ tenantId, branchId, productFamilyId: familyId, currency, spec: pricingSpec, options })`.
- Build `pricingSpec` from `spec` + `normaliseQuoteSections(sections)`.
- Keep the existing "no rules matched" empty-state, but drive it off `breakdown?.matched === 0` or similar signal already in the calculator output.

### 4. Verification

- Reproduce the reported case in Demo3new: Bound Documents, comb binding, no covers, 80gsm bond, 40pp body, colour + duplex, Qty 1 → quote should now show R124 (matching the customer configurator).
- Spot-check a Flyers pack-priced quote and a Presentation with tabs to confirm rate-card + tab-spine paths agree.
- Run typecheck.

## Out of scope

- No changes to underlying calculators (`calculateItemPrice`, `calculatePriceFromRateCard`) or rate-card data.
- No UI redesign of the quote builder — only the pricing wiring behind the existing breakdown panel.
