## Problem

On Bound Documents → Covers, the customer configurator only shows **Acetate Cover** even though the admin Edit Option dialog mirrors 11 catalog values, most toggled **Enabled**.

Root cause is in `src/hooks/useCatalogBackedOptions.ts`:

When `source = "catalog.finishing"`, the overlay throws away the option's saved `values` array and rebuilds the list directly from `catalog_finishing` rows filtered by `is_active = true` at the **master** level. In the master catalogue, only `acetate-cover` is currently `is_active = true`; the other 10 cover rows are `is_active = false`. So even though the admin mirror saved 11 enabled values onto the product, the customer only ever sees 1.

This also means the per-product **Enabled** / **Default** toggles in the admin dialog have no effect on the customer-facing list at all — they're silently ignored for catalog-sourced options.

The same bug exists for `Binding`, `Trimming`, `Stapling`, `Folding`, etc. (every catalog-sourced finishing option), it just hasn't shown up yet because their master rows happen to be active.

## Fix

Change the overlay precedence for `source = "catalog.finishing"` from "rebuild from master" to "enrich the saved values from master":

1. Treat the saved `product_options.values` array as the authoritative list of which catalog codes are wired to this product family.
2. For each saved value, look up the matching row in `catalog_finishing` by `catalog_code` (already mirrored into `metadata.catalog_code` by the admin editor).
3. Drop the saved value when:
   - per-product `is_active = false` (admin disabled it on this product), **or**
   - the master row no longer exists / is `is_active = false` (catalogue retired it).
4. Otherwise merge: keep the saved value's `is_default`, `is_active`, `price_impact`, then overlay the master row's `label`, `binding_method`, `color`, `size_mm`, `max_sheets` onto `metadata` so the preview engine still gets accurate visual data.
5. Fall back to the current "project master rows by category" behaviour **only** when the saved values array is empty (e.g. a brand-new option that hasn't been saved yet).

## Files

- `src/lib/catalog/optionAdapter.ts` — add `enrichFinishingValuesFromMaster(savedValues, masterRows)` that does the merge described above.
- `src/hooks/useCatalogBackedOptions.ts` — in the finishing branch, call the new enricher when `opt.values` has entries; only fall back to `finishingRowsToValues(...)` when the saved array is empty.
- No DB migration required. The admin "Enable / Default" toggles already persist to `product_options.values[*].is_active` / `is_default`.

## Side note (not blocking)

The admin **Edit Option** dialog uses `useCatalogFinishing()` without an `is_active` filter, which is why all 11 cover rows appear in the mirror including ones that are inactive at master level. After the fix above, an admin can enable a value on the product but the customer still won't see it if the master row is inactive — which is correct behaviour but may be confusing. Optional follow-up: grey out / annotate rows whose master `is_active = false` in the admin dialog. Out of scope for this fix unless you want it included.
