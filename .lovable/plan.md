## Goal

The Master Catalogue (`catalog_papers`, `catalog_paper_prices`, `catalog_finishing`, `catalog_finishing_prices`) is currently empty. Master Pricing (`rate_card_papers` / `rate_card_finishing` at `scope_type = 'master'`) is fully populated and is the source we'll backfill from. After this, you'll wire products to reference the catalogue.

## What's in Master Pricing today

**Papers** — one row per (label, gsm, finish, size). Distinct stocks once duplicates are collapsed on (label-without-size, gsm, finish):

- 80gsm Bond — A4, A3
- 90gsm White Bond — A4, A3, A5
- 100gsm Bond / Uncoated — A4, A3 (+ extras)
- 135gsm Gloss — A4, A3
- 170gsm Gloss — A4, A3
- 250gsm Gloss — A4 (+ Matt variant)
- 300gsm Gloss — A4
- 350gsm Matt — A4
- 80gsm Pastel Blue / Green / Pink / Yellow — A4, A3, A5
- 80gsm Recycled White — A4, A3, A5
- (plus any further long-tail rows that exist in master)

**Finishing** — mostly size-agnostic items (per_unit / per_set), plus a few per-sheet items with sizes:

- Binding: Comb 6/10/16/19/25/32/38mm, Wire 8/12mm, Spiral 10/16mm, Ring Binder 25/50/75mm — all per_unit, no size
- Stapling: Saddle Stitch — per_unit
- Cover: Acetate A4/A3, Card Back A4/A3 — per_sheet with size
- Lamination: A4/A3 Gloss + A4/A3 Matt — per_sheet with size
- Folding: Bi / Tri / Z — per_unit, no size
- Guillotining / Trimming: Guillotine flyers (per_unit), Business Card Trim (per_set)

## Backfill strategy

A single data migration that, for the `scope_type = 'master'` rows only:

**1. Papers**

- Group `rate_card_papers` by a stable key — normalised `(label_without_size, weight_gsm, finish)` — to produce one `catalog_papers` row per stock.
- `catalog_papers.code` = stable slug, e.g. `80gsm-bond`, `90gsm-white-bond`, `135gsm-gloss`, `80gsm-pastel-blue`, `80gsm-recycled-white`.
- `label` = stock name without size ("80gsm Bond", "80gsm Pastel Blue", "350gsm Matt").
- `weight_gsm`, `finish` carried over. `category` inferred: `bond` / `uncoated` / `silk` / `gloss` / `matt` → `text` or `cover` based on gsm (≥170 → `cover`, else `text`); pastels → `coloured`; recycled → `recycled`.
- For each source row, insert a `catalog_paper_prices` row keyed `(paper_id, size_code)` where `size_code` is the lower-cased catalogue size (`a4`, `a3`, `a5`, `sra3` …). `sell_price_minor` / `cost_price_minor` = `round(price * 100)`. Skip if the size isn't in `catalog_sizes`.
- `ON CONFLICT (paper_id, size_code) DO NOTHING` so re-runs are safe.

**2. Finishing**

- Group `rate_card_finishing` master rows by `(category, variant, label-without-size, pricing_basis)` to produce one `catalog_finishing` row per item.
- `code` = stable slug, mirroring existing slugs where possible (`comb-6mm`, `wire-12mm`, `saddle-stitch`, `lamination-gloss`, `lamination-matt`, `acetate-cover`, `card-back`, `fold-bi`, `fold-tri`, `fold-z`, `guillotine-flyer`, `trim-bcards`, `ring-binder-25mm`, …).
- For size-agnostic items (binding, stapling, folding, guillotining, trimming) insert one `catalog_finishing_prices` row with `size_code = 'any'` (or null — see open question below).
- For per-sheet sized items (lamination, cover) insert one `catalog_finishing_prices` row per source size, `size_code` lower-cased.

**3. Re-run safety**

- All inserts use `ON CONFLICT` on the natural keys (`catalog_papers.code`, `catalog_finishing.code`, `(paper_id, size_code)`, `(finishing_id, size_code)`) `DO NOTHING`. Running the migration twice produces no duplicates and doesn't overwrite anything you've already edited in the Master Catalogue UI.
- Source `rate_card_*` rows are not modified or deleted. They keep working until you've finished pointing products at the new catalogue.

## What this migration does NOT do

- Doesn't touch tenant or branch rate cards.
- Doesn't link any product family to catalogue items — you'll do that manually via the Catalogue tab on each product as planned.
- Doesn't seed imposition templates (already covered in the earlier plan).
- Doesn't delete or deactivate master `rate_card_*` rows.

## Open question

`catalog_finishing_prices.size_code` is currently `text NOT NULL` (no FK). For size-agnostic items I propose storing the literal string `'any'`. If you'd rather make that column nullable and use `NULL` for "any size", say so and I'll include the schema tweak in the same migration.

## Verification after migration

1. Platform → Master Catalogue → Papers — every distinct stock appears once, with one price row per size it had in Master Pricing.
2. Platform → Master Catalogue → Finishing — every binding/lamination/fold/cover/trim option appears once, with size-agnostic items showing a single price row and lamination/cover showing per-size rows.
3. Re-running the migration produces zero new rows.
4. Master Pricing still loads identically (we haven't touched it).
