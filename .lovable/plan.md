## Goal

Finish the Master Catalogue and make Master Pricing + the print-cost engine reference it as the single source of truth. Then put the cut-sheet vs N-up sheet strategy under explicit per-product control, the way an MIS does.

## 1. Finish the Master Catalogue

Add two tabs to **Platform → Master Catalogue** alongside Sizes / Print Attributes:

- **Papers** (`catalog_papers` + `catalog_paper_prices`). Each paper is size-agnostic (code, label, gsm, finish, category). Prices are entered per **size from `catalog_sizes`** — a dropdown, never free text. So "80gsm Bond" exists once; you set the A4 cost, A3 cost, SRA3 cost as price rows.
- **Finishing** (`catalog_finishing` + `catalog_finishing_prices`). Same shape: category (lamination, binding, cutting…), variant, pricing basis (per item / per sheet / per click), then price rows per size (or no-size for "per item" charges like wire binding).

Nothing else is added to the master catalogue. Click charges stay in pricing, because they are press-specific, not catalogue items.

## 2. Make Master Pricing reference the catalogue

`RateCardEditor` is currently the source of truth for clicks / papers / finishing and uses hard-coded size strings (`A4, A3, SRA3, A5, A6, DL`) plus free-text size fields. We change it so:

- **Click charges** — `size` column becomes a select sourced from `catalog_sizes` (active rows only). The colour/sides columns continue to use `catalog_print_attrs`.
- **Papers** — instead of one row per (paper × size), the editor lists each `catalog_papers` row once with a sub-grid of size rows. You pick paper from the master, then add a price row per size — size comes from `catalog_sizes`, not text.
- **Finishing** — same pattern. Finishing item from `catalog_finishing`; price rows reference `catalog_sizes.code` or "any size" for per-item charges.
- **Photo prints** & **Business cards** rate-card tabs — their `size`/`size_slug` columns also switch to a select bound to `catalog_sizes` (filtered by sensible region tags: photo for photo prints, business-card sizes for cards).

The underlying tenant/branch override flow (scope_type clones) is unchanged — we only change the input controls and reject saves whose `size` isn't a known catalogue code.

## 3. Sheet strategy: cut-sheet vs imposed N-up

The infrastructure already exists (`imposition_templates`, `product_imposition_defaults`) but isn't surfaced as a deliberate per-product choice. We add it as an explicit control on the new **Catalogue** tab of each product family:

```
Document Sizes
  [✓] A4    Sheet strategy: ( ) Cut sheet 1-up    (•) Imposed on …  [SRA3, 2-up ▾]
  [✓] A3    Sheet strategy: (•) Cut sheet 1-up    ( ) Imposed on …
  [✓] A5    Sheet strategy: ( ) Cut sheet 1-up    (•) Imposed on …  [SRA3, 4-up ▾]
  [✓] DL    Sheet strategy: ( ) Cut sheet 1-up    (•) Imposed on …  [SRA3, 8-up ▾]
```

- "Cut sheet 1-up" = print on the same paper size as the document; click and paper are billed at that size.
- "Imposed on parent" = uses an `imposition_templates` row that we already store (`input_size`, `output_size`, `n_up`, `work_style`, bleed/gutter…). The dropdown only shows templates whose `input_size` matches the linked size.

We store the choice in `product_imposition_defaults` (already exists) — `is_primary = true` marks the active strategy for that family+size; absence = cut sheet. Sane defaults per family: bound documents / presentations / loose sheets / booklets → cut sheet on A4/A3; business cards → imposed on SRA3; small flat sheets (A5/A6/DL) when full-bleed → imposed on SRA3.

A small "Press setup" preview shows the resolved parent sheet and n-up so the admin can sanity-check.

## 4. Pricing engine update

The click+paper cost calculator (`calculatePriceFromRateCard`) gets a thin wrapper that, for each line:

1. Looks up the active `product_imposition_defaults` row for `(product_family, size)`.
2. If found → bills click and paper on the **output_size** (the parent), divides by `n_up`, multiplies sheets needed (rounded up).
3. If not found → bills on the document size as today (cut-sheet).

This matches the MIS screenshot's flow (A4 doc → SRA3 sheet → 2-up → cost = SRA3 click + SRA3 paper × sheets/2). No new pricing table is needed.

Finishing prices that depend on size (lamination, trimming) are billed on the **document size** even when printed N-up, because finishing happens after trimming.

## 5. Migration / cleanup

- Backfill `catalog_papers` / `catalog_paper_prices` from the existing master `rate_card_papers` rows (group by label+gsm+finish to dedupe; carry size+price into the prices table).
- Same for finishing.
- Keep `rate_card_papers` / `rate_card_finishing` as the editable working tables (tenant/branch clones live there); the master tab in RateCardEditor reads/writes through `catalog_*` and mirrors changes back so old code keeps working until cutover.
- Seed sensible `imposition_templates` if missing: A4-on-SRA3-2up, A5-on-SRA3-4up, A6-on-SRA3-8up, DL-on-SRA3-8up, BC-on-SRA3-24up.
- Re-link existing `product_options` size values to `catalog_sizes` (already done by the previous migration).

## Out of scope

- No press / device modelling beyond what `imposition_templates.output_size` already captures.
- No multi-job ganging across orders.
- Pricing rules (`pricing_rules`) keep working unchanged.

## Verification

1. Master Catalogue → add SRA3 to Papers, set A4/A3/SRA3 prices. Save. Reopen — values persist; sizes shown are exactly the active rows from `catalog_sizes`.
2. Master Pricing → all size dropdowns list only catalogue sizes; saving a click row with a non-catalogue size is rejected.
3. Admin → Products → Business Cards → Catalogue: A4 disabled, BC55×85 enabled with "Imposed on SRA3, 24-up". Storefront quote for 100 business cards bills SRA3 paper + SRA3 click × ceil(100/24) sheets.
4. Admin → Products → Bound Documents → A4 set to "Cut sheet 1-up". Same quote engine bills A4 click + A4 paper per page side. No regression vs current pricing.
5. Branch override that disables SRA3 paper still hides it from both the size advisory and the imposition picker for that branch.