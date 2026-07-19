## Root cause

`QuoteSpecBuilder` loads product options via `useProductOptions(familyId)`, which returns raw `product_options` rows straight from the DB. For families like Booklets, the Document Size / Paper Stock options are **catalog-backed** (`source = 'catalog.sizes'` / `catalog.papers`), so their inline `values` array is empty — the real choices are computed at render time by overlaying the master catalogue (and any branch overrides).

Because of that:

- The Document Size dropdown in the panel has zero items → shows "Select Document Size" and stays empty.
- The A4 seed effect (which walks `sizeOpt.values` looking for `width_mm/height_mm ≈ 210/297`) never finds a match, so nothing gets pre-selected.
- Every downstream option (Paper Stock, Covers, Print Colour, etc.) that depends on a size being chosen stays on "Not selected".

The customer configurator (`OrderBuild.tsx`) doesn't hit this because it uses `useCatalogBackedOptions(productFamilyId, branchId)`, which does the overlay and returns fully-populated `values`.

## Fix

Swap the options source in the quote builder so it matches the customer flow.

### `src/components/quotes/QuoteSpecBuilder.tsx`

1. Replace `import { useProductOptions } from "@/hooks/useProductOptions"` with `import { useCatalogBackedOptions } from "@/hooks/useCatalogBackedOptions"`.
2. Replace the `useProductOptions(familyId || null)` call with `useCatalogBackedOptions(familyId || null, branchId ?? null)` so:
   - Document Size gets populated from `catalog_sizes` (with `metadata.width_mm/height_mm` present, which the existing A4 seed effect already knows how to match).
   - Paper Stock gets populated from `catalog_papers`.
   - Branch-specific enable/disable and price deltas cascade through, same as the customer sees.
3. No other changes needed — the existing A4 seed effect, `OptionsPanel`, `calculateItemPrice`, and save path all keep working; they just receive proper `values` now.

### Out of scope

- No schema changes, no changes to `OptionsPanel`, no changes to the customer flow, no changes to the save/quote persistence.
- Multi-section families (Bound Documents etc.) also benefit automatically because the same options list feeds their panel.
