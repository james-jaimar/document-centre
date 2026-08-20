# Finish the metric / imperial separation in the customer configurator

## What I checked

- `resolve_product_options` **is** now unit-filtered. Called for Bound Documents against Demo Branch it returns only metric rows (`a4`, `a5`, `130gsm…`, `250gsm…`) — no imperial leakage.
- The master catalogue holds both systems side by side: 42 metric / 45 imperial papers, and every finishing category is mirrored (e.g. `cover`: 29 metric + 29 imperial).
- No branch or tenant has a `regional.measurement_unit` row yet, so everything currently resolves to metric by default.

## Where the mixing you saw still comes from

`src/hooks/useCatalogBackedOptions.ts` — the hook the customer configurator actually renders from — loads the master catalogue directly and **without any unit filter**:

- `catalog_papers` (master, active) → used for the Paper Stock and Cover seeds
- `catalog_finishing` (master, all) → used for every `catalog.finishing` option
- `catalog_sizes` (master, active) → size fallback
- `catalog_print_attrs` (master, all)

For Bound Documents the **Covers** option is `source = catalog.finishing`, `category = cover`, with an empty saved values array — so it seeds straight from all 58 master cover rows and shows `250gsm` and `100lb` together. The finishing path never consults the unit-filtered RPC at all. Paper Stock and Document Size have the same hole in their fallback branches.

## The fix

1. **Resolve the active unit system in the hook.** Use the existing `useCatalogUnitSystem(tenantId, branchId)` (branch overrides tenant, matching the DB helper) inside `useCatalogBackedOptions`.
2. **Filter every master query by that unit system.** Papers, sizes and finishing get `.eq("unit_system", unitSystem)`; print attributes stay unfiltered (they are unit agnostic). The unit becomes part of each React Query key so switching a branch's locale refetches.
3. **Filter the enrichment path too.** `enrichPaperValuesFromMaster` / `enrichFinishingValuesFromMaster` / `enrichSizeValuesFromMaster` currently keep saved values whose slug exists in master. With the master list already scoped to one unit, a saved value from the other system will be dropped — plus map it to its unit twin (`metadata.unit_twin`) first via the existing `twinCodeLookup`, so a metric-authored `250gsm-silk` becomes `100lb-silk` on an imperial branch instead of disappearing.
4. **Hold the loader until the unit is known** so the configurator never flashes the wrong list, and don't render options before `unitSystem` resolves.

## Verification

- Demo Branch (no override → metric): Covers shows only gsm rows; Paper Stock only gsm.
- Set Demo Branch → Imperial in Branch Settings → Regional: same product shows only `lb` covers and inch sizes, with equivalents preserved via unit twins.
- Confirm Print Colour / Print Sides are unaffected.

## Technical notes

Change is confined to `src/hooks/useCatalogBackedOptions.ts` and the enrichment helpers in `src/lib/catalog/optionAdapter.ts`. No database migration needed — the SQL side is already correct.
