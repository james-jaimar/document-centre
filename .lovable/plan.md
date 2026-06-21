## Why the dropdown says "No imposition templates for BC-90X55"

Templates store `input_size` as a coarse paper key (`A4`, `A3`, `BC`, `DL`, …) but the master catalogue stores granular size codes (`bc-90x55`, `bc-90x50`, `bc-85x55`).

The Sheet-strategy dropdown filters with:

```ts
templates.filter(t => t.input_size.toLowerCase() === s.code.toLowerCase())
```

`'bc' !== 'bc-90x55'`, so all three Business Card templates are hidden — even after you assigned them to the Business Cards product. The same issue will hit any product whose catalogue size code is more specific than the template's `input_size` bucket (e.g. multiple postcard or flyer sizes in future).

## Fix

Match a template to a catalogue size by **finished dimensions**, not by the `input_size` enum string. Each template already carries `input_width_mm` / `input_height_mm`, and each `catalog_sizes` row carries `width_mm` / `height_mm`, so this is a pure UI logic change — no schema or data migration.

### Matching rule

A template matches a size when:
- `{input_width_mm, input_height_mm}` equals `{size.width_mm, size.height_mm}` (orientation-insensitive — allow the swapped pair so a landscape A4 template still matches A4), with a 0.5 mm tolerance for float noise.

For each enabled size in `ProductCatalogueLinksTab` Sheet-strategy section:
- Show every template whose dimensions match (sorted: cut-sheet 1-up first, then by n-up ascending, then name).
- Empty-state copy unchanged: "No imposition templates for {SIZE LABEL}".

### Files

- `src/components/admin/ProductCatalogueLinksTab.tsx` — replace the `templates.filter(t => t.input_size === s.code)` predicate (and the `impositionBySize` builder) with a `dimsMatch(template, size)` helper.
- `src/hooks/useCatalog.ts` — `useSetProductImposition` currently clears existing defaults using the same `input_size === code` test (line ~362). Switch it to the same dimension-based predicate so re-assigning a template still removes the previous one cleanly. Accepts the size's `width_mm` / `height_mm` in the mutation input instead of `input_size_code`.

### Out of scope

- No DB migration; `input_size` stays as a descriptive label on templates.
- Production panel template picker (`useTemplatesForProductFamily`) is unchanged — it already lists templates assigned to the family.
- The Imposition Templates admin editor still uses the paper-size enum dropdown; no changes there.

### Verification

After the change, on Admin → Products → Business Cards → Catalogue Links → Sheet strategy:
- `90x55mm Bus Card` row → dropdown lists "Cut sheet 1-up" + "21-up on SRA3 — Bus Cards (90x55mm) 21 up SRA3".
- `90x50mm` row → lists the 90x50 template only.
- `85x55mm Bus Card` row → lists the 85x55 template only.
- A4 / A3 products keep showing their existing matching templates (regression check).