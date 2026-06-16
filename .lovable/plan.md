# Honour admin toggles across all catalog-backed options

## The bug

When admin opens **Products → Options → Paper Stock** and toggles individual values on/off, those toggles are saved correctly to `product_options.values[].is_active` (verified: Bound Documents has exactly 3 active papers — 80gsm Bond, 130gsm Gloss, 130gsm Matt). But the customer-facing picker shows all ~13 papers.

Root cause is in `src/hooks/useCatalogBackedOptions.ts`. Two code paths discard the admin's saved values and rebuild a fresh list from the master catalogue:

- **`catalog.papers`** — calls `paperRowsToValues(masterPapers)` unconditionally, throwing away `is_active` toggles.
- **`catalog.sizes`** — calls `sizeRowsToValues(masterSizes)` (or projects from links), same problem.

The other catalog sources already do the right thing — they call `enrichXxxValuesFromMaster(saved, master…)` which preserves the saved array (and therefore each value's `is_active`), only refreshing labels / price / metadata from master:

- `catalog.finishing` ✅ uses `enrichFinishingValuesFromMaster`
- `catalog.print_attrs` ✅ uses `enrichPrintAttrValuesFromMaster`

The customer dropdown then hides inactive entries via `isValueActive` in `OptionSelector.tsx`. That part already works — it just never sees the toggles because they were overwritten upstream.

## What to change

### 1. `useCatalogBackedOptions.ts` — preserve saved toggles for papers and sizes

Mirror the finishing / print_attrs pattern:

- **`catalog.papers`**: if `opt.values` (saved) is non-empty, keep it and enrich each entry's `metadata` / `label` / `price` from `masterPapers` (matched by slug). Only when saved is empty fall back to seeding from `paperValuesFromLinks ?? allPaperValues` (or `allCoverPaperValues` for cover rows).
- **`catalog.sizes`**: same enrichment from `masterSizes`. Seeding fallback stays as today (links → master).

Add small helpers `enrichPaperValuesFromMaster(saved, masterPapers)` and `enrichSizeValuesFromMaster(saved, masterSizes)` in `src/lib/catalog/optionAdapter.ts` alongside the existing ones, so behaviour is symmetric across sources.

### 2. Audit each option source for the Bound Documents family

Verify after the fix that the customer picker matches admin toggles for every option. Current saved-state in DB for `edce25f3-…` family:

| Option | Source | Saved values | Risk before fix |
|---|---|---|---|
| Paper Stock | catalog.papers | 25 rows, 3 active | **broken — fix above** |
| Document Size | catalog.sizes | 0 (now driven by links) | already correct after last change |
| Covers | catalog.finishing | 18 | already enriched |
| Binding | catalog.finishing | 25 | already enriched |
| Finishing | catalog.finishing | 6 | already enriched |
| Inserts | catalog.finishing | 4 | already enriched |
| Tab Dividers | catalog.finishing | 11 | already enriched |
| Print Colour | catalog.print_attrs | 0 (seeds from master) | already enriched |
| Print Sides | catalog.print_attrs | 0 (seeds from master) | already enriched |
| Print to Edge | manual | 4 | unaffected |

For each, spot-check that toggling a value off in admin removes it from the customer dropdown.

### 3. Confirm single source of truth per option

Today there are two surfaces that can shape an option's value list:

- per-value `is_active` toggle in **Products → Options** editor
- entry presence in **Products → Catalogue** tab (`product_catalog_links`)

After the previous round we agreed Document Size lives only in the Catalogue tab. For everything else (Paper Stock, Covers, Binding, Finishing, Inserts, Tab Dividers, Print Colour/Sides), the **Options editor toggles are authoritative** and `product_catalog_links` is only used as a seeding hint when saved values are empty. This matches the enrichment pattern above and what the admin UI implies.

No schema changes. No data migration. Pure overlay-logic fix in one hook plus two small helpers.

## Verification

- Open `/t/<tenant>/order/bound-documents` as a customer, click Paper Stock — expect only 80gsm Bond, 130gsm Gloss, 130gsm Matt.
- Toggle one of those off in admin → reload customer view → it disappears.
- Spot check Binding / Covers / Finishing / Inserts / Tab Dividers / Print Colour / Print Sides dropdowns match their admin Enabled state.
