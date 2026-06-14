## Goal

Stop pricing every (paper × size) permutation as its own SKU. Instead model the real world: a paper exists in a small set of **stocked sheet sizes** (its "parent sheets"), and every finished size is derived by imposition. Charge per whole parent sheet — no fractions.

## Core model

**A paper SKU = `(weight, finish, color)` + the list of sheet sizes it is stocked in.**

Examples the user gave:
- `80gsm Bond` → stocked sizes: `A4, A3`
- `135gsm Gloss` → stocked sizes: `A4, A3, SRA3`
- `350gsm Silk` → stocked size: `SRA3` only
- `Photo Lustre 260gsm` → stocked sizes: photo sizes only
- `Poster 200gsm` → stocked sizes: poster sizes only

The stocked sizes live **on the paper row** (a small JSONB array of size codes), not as separate rows.

**Imposition map (hard-coded TS constant)** — sheets a finished size yields per parent:

```text
parent SRA3:  A3=1, A4=2, A5=4, A6=8, DL=6, BC(90×50)=24
parent A3:    A3=1, A4=2, A5=4, A6=8
parent A4:    A4=1, A5=2, A6=4
(poster + photo papers carry their own size lists; ups = 1 each)
```

**Parent-sheet selection per quote** — given a paper and a requested finished size:
1. Build the candidate set = stocked sizes of that paper that can yield the finished size (i.e. imposition map has an entry).
2. Pick the **smallest** candidate (cheapest waste). E.g. A4 finished on 80gsm Bond → A4 cut sheet; A6 finished on 80gsm Bond → A3 cut sheet; A5 finished on 350gsm Silk → SRA3.
3. **Edge-to-edge override:** if the customer selects bleed/edge-to-edge, force SRA3. If the chosen weight isn't stocked in SRA3, auto-substitute the next-heaviest SRA3 row in the same finish (the existing weight/finish).
4. **Cover rule:** product families flagged `cover_is_heavy_stock` always price covers from an SRA3 row.
5. **A5 binding** prices off the A4 binding row (configured on the binding catalogue, not paper).

**Price formula per item line:**
```
parentSheetsNeeded = ceil(quantity / ups(parentSize, finishedSize))
linePrice          = parentSheetsNeeded × parentSheet.sellPrice
```
Click charges, finishing, binding are added by the existing rate-card path unchanged.

## Data changes (full rip-and-replace)

1. **`catalog_papers`** — add `stocked_sizes text[]` (e.g. `{A4,A3}`, `{SRA3}`, `{A4,A3,SRA3}`, `{Photo_4x6,Photo_5x7,...}`). Add `is_cover_stock bool` and `is_edge_to_edge_only bool` (advisory). Drop the `size`/`size_code` column from the row identity — `code` becomes `(weight-finish)` without a size suffix.
2. **`catalog_paper_prices`** — keep one price row per `(paper_id, parent_size, scope)`. Migration consolidates today's rows: for each weight/finish, keep only the A4, A3 and SRA3 priced rows (whichever exist), and drop the rest. Today's A5/A6/DL/SRA1/SRA2/A0/A1/A2 rows become **stale** and are deleted — their effective price was always a multiple of the parent sheet anyway.
3. **`catalog_sizes`** — keep, but it becomes a pure lookup of finished sizes for the UI dropdowns. Not used by the pricing math.
4. **`product_catalog_links`** — the link from a product family to its allowed papers stays, but no longer enumerates sizes. Allowed finished sizes are defined per product family (see "Product printing rules" below).
5. **`branch_catalog_overrides`** — same shape, now keyed by `(paper_id, parent_size)` instead of `(paper_id, size)`.

## Product printing rules (the "toggles, switches, parameters" the user asked for)

Add a single JSONB column `printing_rules` on `product_families` with this shape (admin-editable, no code change per product):

```json
{
  "allowed_finished_sizes": ["A4P","A5P"],
  "default_finished_size": "A4P",
  "cover_is_heavy_stock": true,
  "force_sra3_when_edge_to_edge": true,
  "binding_size_inherits_from": "A4",
  "min_quantity": 1
}
```

Seeded defaults from your spec:
- **Bound Documents** → A4P, A5P
- **Presentations** → A5L, A4L, A3L
- **Ring Binders** → A4P
- **Stapled / Loose Pages** → A4P, A5P
- **Booklets** → A5P, A5L, A4P

## Engine changes

- New `src/lib/pricing/parentSheet.ts` — pure functions: `pickParentSheet(paper, finishedSize, opts)`, `sheetsNeeded(parent, finished, qty)`, `priceLine(paper, finishedSize, qty, opts)`.
- New `src/lib/pricing/impositionMap.ts` — the hard-coded ups table above.
- `src/lib/calculatePrice.ts` and `useCatalogPrices` — rewritten to call the new engine. Click charges, finishing, binding rate-card flows are untouched.
- All option lookups in `PriceSummary`, `useProductRecipe`, `MasterCatalogPricingEditor`, `useResolvedCatalogOptions` updated to reference the new `(paper, parent_size)` shape.

## Admin UI changes

- **Master Catalogue → Paper Stocks**: each row collapses; instead of one row per size, one row per (weight × finish × color) with a chip list of stocked sizes and an inline price input per stocked size.
- **Pricing editor**: shows the same condensed grid. Removing today's noise drops the table from hundreds of rows to ~30–40.
- **Product Families**: add a "Printing Rules" panel exposing the JSON toggles above as form controls.

## Migration plan (single migration)

1. Add `stocked_sizes`, `is_cover_stock`, `is_edge_to_edge_only` to `catalog_papers`.
2. Populate `stocked_sizes` from existing rows grouped by `(weight, finish, color)`.
3. Pick one canonical paper row per `(weight, finish, color, scope)` and merge the rest's prices into `catalog_paper_prices` keyed by `parent_size`.
4. Delete child-size paper rows and any `catalog_paper_prices` rows whose size is not in `{A4, A3, SRA3}` (plus the explicit photo/poster size sets carried by those papers).
5. Add `printing_rules jsonb default '{}'` to `product_families` and seed the five families above.
6. Drop redundant indexes and rebuild unique key on `(scope_type, weight, finish, color, tenant_id, branch_id)` for papers.

## Out of scope (next pass)

- Tenant/branch overrides UI redesign — the data shape works, but the editor cleanup is a follow-up.
- Photo print and business card SKUs — they already live on the rate-card tables and just need their stocked-size rules wired in; doing it in this same pass if time allows.
- Cover-vs-body split UI in the order builder — already exists, just needs to read the new `cover_is_heavy_stock` flag.

## Verification

- Spot-check: 100× A6 flyer on 250gsm Gloss → engine picks SRA3 (no A6 stock at 250gsm), 8-up, ceil(100/8)=13 sheets × SRA3 sell price.
- 1× A4 letter on 80gsm Bond → picks A4 cut sheet, 1 sheet.
- 50× A5 booklet body on 80gsm Bond → picks A4 cut sheet (A5 not stocked at 80gsm), 2-up, ceil(50/2)=25 sheets.
- Edge-to-edge A4 flyer on 250gsm Gloss → forces SRA3, 2-up, ceil(qty/2) sheets.
