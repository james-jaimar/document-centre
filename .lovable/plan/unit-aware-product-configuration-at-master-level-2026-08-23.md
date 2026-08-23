# Unit-aware product configuration at master level

## What I verified

- All 287 master `product_catalog_links` point at **metric** codes — none are imperial. The link layer is already canonical and clean.
- Papers and finishing are properly mirrored master lists with `unit_twin` pointers: 42 metric / 45 imperial papers, 101 / 101 finishing. A metric link translates to its imperial equivalent automatically.
- Sizes are **not** twinnable — 24 metric vs 27 imperial with only 7 twins, because A4 and Letter are genuinely different products, not conversions.
- The mixing is in the admin UI only: `ProductOptionsEditor` calls `useCatalogSizes()`, `useCatalogPapers()`, `useCatalogFinishing()` with no unit argument, so a Paper Stock option mirrors all 87 rows (the "Catalog values (87)" in your screenshot). `PlatformCatalog` already has the Metric/Imperial toggle; the product editor never got one.
- `catalog_papers` has a `category` column (bond / coated / coloured / cover / recycled / speciality / text) that the product option editor ignores — that is why poster and photo stocks appear under Bound Documents.

So no product families need duplicating. One family, configured through two lenses.

## The model

```text
Master catalogue          metric rows          imperial rows
                              |                     |
                        unit_twin pointer  <--------+   (papers, finishing)
                              |
product_catalog_links   metric code = canonical      (papers, finishing)
                        per-unit rows                (sizes only)
                              |
resolve_product_options -> filtered + twin-mapped by branch unit system
```

Papers and finishing stay authored once, in metric. Sizes get authored per unit, because there is no honest conversion.

## What gets built

### 1. Metric / Imperial toggle in the product options editor

A segmented toggle at the top of the Options tab for a product family, matching the Master Catalogue one. It sets the lens for everything below: which master rows are mirrored into a `catalog.*` option, and which unit the labels render in (mm/gsm vs in/lb).

Every master query in the editor gets the unit argument, so Paper Stock drops from 87 values to 42 (metric) or 45 (imperial). Same for sizes, finishing and the read-only mirrors.

### 2. Sizes become per-unit links

`product_catalog_links` gains a nullable `unit_system` column:

- `null` = applies to both systems (papers, finishing, print attributes — unchanged behaviour).
- `'metric'` / `'imperial'` = size links, stored separately per system.

Existing size links are backfilled to `'metric'`. Imperial size selections for each family are authored fresh in the imperial view (Letter, Legal, Tabloid, ANSI). `resolve_product_options` is updated to select links matching the resolved unit system or `null`.

Papers and finishing links keep being saved as metric codes even when the admin is working in the imperial view — the editor writes the twin's metric code — so there is exactly one source of truth and no drift.

### 3. Paper category filter on options

`catalog.papers` options gain an optional category filter (multi-select over the master paper categories), mirroring how finishing options already filter by category. Bound Documents Paper Stock can then be scoped to text + coated + cover and stop listing poster, photo and canvas stocks. Blank filter = current behaviour.

### 4. Coverage check screen

A small "Unit coverage" panel in the product family editor listing, per catalogue: values enabled in metric vs imperial, and flagging anything with no counterpart (a metric paper with no imperial twin, an imperial size with no metric selection). This is how you confirm a family is genuinely sellable in both markets before switching a branch to imperial.

### 5. Master catalogue gaps

3 metric papers currently have no imperial twin and 20 imperial sizes have no metric counterpart (expected for Letter/Legal). The coverage panel surfaces these; twin gaps on papers get filled in a data pass so nothing silently vanishes for an imperial branch.

## Technical notes

- Migration: `alter table product_catalog_links add column unit_system text null` + backfill size rows to `metric`; update the unique index to include it; rewrite `resolve_product_options` link selection to `(unit_system is null or unit_system = resolved_unit)`.
- Product option `metadata` gains `paper_categories: string[]` for the category filter; `useCatalogBackedOptions` applies it alongside the unit filter already in place.
- Editor changes: `src/components/admin/ProductOptionsEditor.tsx` (toggle, scoped queries, category filter UI, twin-aware save), `src/hooks/useCatalog.ts` link mutations to carry `unit_system`.
- Customer side needs no change — `resolve_product_options` and `useCatalogBackedOptions` are already unit-filtered from the previous pass.
