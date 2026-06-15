## Problem

The customer flip-book preview reads visual metadata directly off the selected option value:

- `selectedBindingArt` → `metadata.binding_method` + `metadata.color` → which spine PNG to draw
- `inferPreviewType` → `metadata.binding_method` → which preview engine to launch
- `calculatePrice` / `useBindingSpecifications` → `metadata.binding_method` + `size_mm` → sheet caps & pricing

When Binding (or any visual finishing) was a **manual** option, those metadata keys were hand-authored in `productOptionValues.ts` (e.g. `{ binding_method: "spiral", color: "Black", size_mm: 10 }`).

Now that Binding is sourced from **Master Catalogue → Finishing**, the mirror builder in `ProductOptionsEditor` only copies `category` + `catalog_code`. `catalog_finishing` rows have empty `metadata` JSONB, so the preview can no longer figure out the method, size or colour. Result: spine artwork disappears, preview engine falls back to "loose sheets", and binding capacity validation breaks.

The same gap exists for any finishing category the preview cares about (lamination, cover stocks, edges).

## Fix

Carry the visual/structural metadata from `catalog_finishing` into the option values that the preview consumes.

### 1. Schema — enrich `catalog_finishing`

Add nullable structured columns (admin-editable in the Master Catalogue → Finishing editor, used only by Binding-category rows today, available for future use elsewhere):

| Column           | Type   | Purpose                                                                |
| ---------------- | ------ | ---------------------------------------------------------------------- |
| `binding_method` | text   | `comb`, `spiral`, `twin_loop`, `ring_binder`, `saddle_stitch`, `perfect` |
| `color`          | text   | `Black`, `White`, `Silver`, `Clear`, …                                 |
| `size_mm`        | int    | spine diameter in mm                                                   |
| `max_sheets`     | int    | optional override for `binding_specifications` lookup                  |

Back-fill in the migration by parsing existing codes (`spiral-10mm` → spiral / 10mm / Black default; `wire-*` → twin_loop; `comb-*` → comb; `ring-binder-*` → ring_binder). The seed numbers in `productOptionValues.ts` are the source of truth for the back-fill values.

### 2. Mirror builder — copy metadata into option values

In `ProductOptionsEditor.refreshCatalogMirror`'s `catalog.finishing` branch, extend the `extraMeta` object so the structured option value receives:

```ts
{
  category: cat,
  binding_method: f.binding_method,
  color: f.color,
  size_mm: f.size_mm,
  max_sheets: f.max_sheets,
}
```

Filter out `null` keys so non-binding finishing rows stay clean.

### 3. Live overlay for customers — add finishing to `useCatalogBackedOptions`

Today the hook overlays only Paper Stock and Document Size from the master catalogue. Add a third branch keyed off option `source === "catalog.finishing"` (or fall back to name match for "Binding"/"Cover Lamination") that:

1. Loads `catalog_finishing` once.
2. Builds `StructuredOptionValue[]` via a new `finishingRowsToValues(rows, category)` adapter in `src/lib/catalog/optionAdapter.ts`, projecting the same metadata fields.
3. Overlays only when the master catalogue has rows for that category — otherwise keeps existing values (so legacy manual Binding rows still work until migrated).

This means a new catalog finishing row immediately appears in the customer picker without re-editing the product.

### 4. Audit each product family

For every family currently in `product_options`, decide which options should be catalog-sourced and update them in the admin once the schema lands:

| Family            | Options to switch to catalog                          |
| ----------------- | ----------------------------------------------------- |
| Bound Documents   | Binding, Cover Lamination, (Cover Stock already cat.) |
| Brochures         | Cover Lamination, Fold (manual stays)                 |
| Booklets          | Binding (saddle stitch), Cover Lamination             |
| Loose Sheets      | (none — no binding, lamination optional)              |
| Photo Prints      | (uses rate-card path, unaffected)                     |

We do this as a one-off pass after step 3 is live; the editor already supports it.

### 5. Tests

Add unit tests for:

- `finishingRowsToValues` — projection of method/color/size into value metadata.
- `selectedBindingArt` — picks correct spine when option came from catalog (uses a catalog-mirrored value).
- `inferPreviewType` — chooses bound-preview when `binding_method` arrives via catalog.
- Migration back-fill — every existing binding row ends up with non-null `binding_method`.

## Files

```text
supabase/migrations/<new>.sql                  # add columns + back-fill
src/integrations/supabase/types.ts              # regen
src/lib/catalog/optionAdapter.ts                # + finishingRowsToValues
src/hooks/useCatalogBackedOptions.ts            # overlay finishing
src/components/admin/ProductOptionsEditor.tsx   # copy metadata in mirror
src/components/pricing/MasterCatalogPricingEditor.tsx  # expose new fields for binding rows
src/lib/catalog/optionAdapter.test.ts           # new
src/lib/orders/selectedBindingArt.test.ts       # new
```

## Out of scope

- Re-modelling lamination/cover-stock preview effects (current behaviour preserved).
- Changing the spine PNG asset library — `bindingAssets.ts` is unchanged.
- Pricing engine internals — once `binding_method` flows through, `calculatePrice` works as before.
