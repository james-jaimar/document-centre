# Show finishing options on the storefront product page

## Confirmed cause

`src/pages/storefront/StorefrontProduct.tsx` builds its Size / Paper / Sides / Quantity dropdowns straight from the pack rows, filtering only on size, paper and sides. It never reads the family's `pricing_options` and never filters on each row's `option` slug.

A5 Diary Covers has two options ("with Gloss Lam", "with Matt Lam"), so every quantity exists twice in the ladder. The quantity list therefore renders 25, 25, 50, 50, 100, 100… and the trigger shows the two duplicate values run together ("2525"). Inside the configurator this works because that screen already has a finishing-option selector.

The data is available: `useStorefrontCatalogue` already resolves the blocks per branch and hides trade-only ladders, and `src/lib/pricing/packOptions.ts` exposes `normalizeOptions`, `visibleOptions` and `packQuantitiesForOption`.

## Changes (all in the storefront product page)

1. Read the family's `pricing_options` via `normalizeOptions`, then `visibleOptions(..., pricingTier)` so consumers never see trade-only options.
2. When there is more than one visible option, render a "Finishing option" select above Quantity, defaulting to the first option; keep it hidden for products with no options.
3. Filter the quantity ladder by the selected option using `packQuantitiesForOption`, so quantities become unique (25, 50, 75, 100…) and the price matches the chosen option.
4. Derive Size / Paper / Sides lists from the option-filtered rows too, so the axes stay consistent.
5. Presentation tidy-up on this panel:
   - drop the forced `toUpperCase()` on size/paper labels — show the admin's code as entered, wildcard `*` still shown as "Any";
   - when an axis has only one value, show it as a read-only line instead of a single-choice dropdown, so the panel reads Size / Finishing option / Quantity cleanly.
6. Carry the selected option through to the configurator link (`startOrderPath`) as a query param where the builder already accepts one, so the choice made on the product page is preselected; if no such param exists, leave the link untouched.

## Notes

- Display/selection only: no pricing-engine, schema or admin changes. Prices continue to come from `rowPriceMinor` with the customer's tier.
