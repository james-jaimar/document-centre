# Restore the original Covers experience (catalog-backed)

## What changed, and why it looks different

I traced your four screenshots to the code:

| Option | Currently sourced from | Status |
|---|---|---|
| Covers (image 1) | `catalog.finishing` (category = `cover`) | **Broken** — collapsed to one "Cover" group, fewer rows, generic labels |
| Paper Stock (image 2) | `catalog.papers` | OK — already groups as Text / Coloured / Recycled |
| Print to Edge (image 3) | `manual` | OK — unchanged |
| Inserts (image 4) | `manual` | OK — unchanged |

So the regression is **only on Covers**. Two root causes:

1. **Sub-grouping was lost.** The original manual list had four section headers — `NO COVER`, `CLEAR COVERS`, `WHITE CARD STOCK`, `PRINTED COVERS`. The catalog adapter (`src/lib/catalog/optionAdapter.ts`, `finishingRowsToValues`) sets `group = capitalise(category)` for every cover row, so they all collapse into one "Cover" header.

2. **The master catalog has fewer / different cover entries than the original manual list.** Current catalog rows (11): `acetate-cover`, `matte-pvc-cover`, `frosted-pvc-cover`, `card-back-black/navy`, `card-cover-160/250/300`, `silk-cover-250`, `gloss-cover-250`, `card-back`. The original manual list had 18 entries with descriptive combo names (`Clear Front + Black Card Back`, `Matte Front + White Card Back`, `Printed Cover (300gsm Silk)`, an explicit `No Cover`, etc.) plus richer pricing per combo.

## Plan

### 1. Expand `catalog_finishing` cover rows (data migration)

Add the missing rows so the master catalogue contains every combo the original list had. New codes (illustrative):

- `cover-none` — *No Cover* → group `No Cover`
- `clear-front-black-back`, `clear-front-white-back`, `clear-front-navy-back` → group `Clear Covers`
- `matte-front-black-back`, `matte-front-white-back` (`navy` if you want it) → group `Clear Covers`
- `frosted-front-black-back`, `frosted-front-white-back` → group `Clear Covers`
- Re-use existing `card-cover-160 / 250 / 300`, `silk-cover-250`, `gloss-cover-250` for `White Card Stock` (rename label to match old style: `160gsm White Card (Front & Back)` etc.)
- `printed-cover-body`, `printed-cover-silk-250`, `printed-cover-gloss-250`, `printed-cover-silk-300`, `printed-cover-gloss-300` → group `Printed Covers`

Each row carries:
- `metadata.cover_group` = `No Cover` | `Clear Covers` | `White Card Stock` | `Printed Covers`
- `metadata.front` / `back` / `front_thickness_micron` / `weight_gsm` / `finish` / `uses_body_stock` / `is_printed` — so the flip-book preview keeps rendering the right material.
- A row in `catalog_finishing_prices` so the `(+R 5,00/doc)` chips appear (same numbers the manual list used: R5 clear, R6.50 matte, R7 frosted, R4–R10 card, R10–R14 printed).

Deprecate the duplicates (`acetate-cover`, single `matte-pvc-cover`, etc.) by setting `is_active = false` so legacy orders still resolve.

### 2. Teach the adapter to honour the sub-group

In `src/lib/catalog/optionAdapter.ts`:
- In `finishingRowsToValues` and `enrichFinishingValuesFromMaster`, when `category === 'cover'` use `meta.cover_group` (falling back to a code-prefix map) for the `group` field instead of the generic `capitalise(category)`.
- Extend `previewMetadataForFinishingCode` so every new code maps to the right preview metadata (front/back materials, thickness, weight, `is_printed`, `uses_body_stock`).

No change is needed in `OptionSelector.tsx` — it already renders one `SelectGroup` per distinct `group`, which is exactly how the four section headers appeared originally.

### 3. Wire the Bound Documents → Covers product_option to the new catalogue

Update the row's `values` array (mirror of enabled catalog codes) so all the new codes are enabled with the right `is_default` (`cover-none` default) and group preserved. `manual_values` is left untouched so the manual safety net still works.

### 4. Verify

- Open Bound Documents on Postnet → confirm the Covers dropdown shows the four headers in the right order with the original labels and per-combo prices.
- Pick `Matte Front + Black Card Back` → confirm flip-book renders matte PVC + black card back exactly as before.
- Pick `Printed Cover (250gsm Silk)` → confirm preview renders printed silk cover.
- Confirm `No Cover` is the default and hides cover-related downstream options as before.
- Switch the Admin source toggle Manual ↔ Catalog → confirm both lists now look effectively identical to the customer.

## Out of scope (working today, will not touch)

- Paper Stock, Print to Edge, Inserts dropdowns — they already match the originals.
- The Admin Manual/Catalog source toggle and the `manual_values` backup behaviour from the previous round.
- The catalog `binding` sub-grouping (already correct).
