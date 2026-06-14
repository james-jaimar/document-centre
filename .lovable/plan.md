## What I found

I audited every pricing table against your cleaned-up Master Catalogue. There are three separate problems, not one.

### 1. Legacy rate-card tables are still alive (and massive)

`rate_card_papers` and `rate_card_finishing` are the **old** pricing model — superseded by `catalog_papers` / `catalog_paper_prices` and `catalog_finishing` / `catalog_finishing_prices`. They've never been retired and have cascaded into tenants/branches:

| Table | Master | Tenant | Branch |
|---|---|---|---|
| `rate_card_papers` | 122 | 488 | **63 074** |
| `rate_card_finishing` | 114 | 456 | **58 938** |
| `rate_card_clicks` | 24 | 96 | 12 408 (keep) |

Click charges, Photo Prints and Business Cards legitimately live on rate-card tables. Paper stocks and Finishing do not — they're duplicates of the catalogue.

### 2. Catalogue Paper Prices have real coverage gaps

10 active master papers have **no** price row at all:

- Gloss Photo, Matt Photo, Poster paper Bond
- 170gsm Matt, 200gsm Gloss, 250gsm Matt, 300gsm Matt, 350gsm Gloss
- Photo Poster Paper (Gloss), Premium Poster Paper (Gloss + Satin)

And only 4 papers have an SRA3 price (130 Gloss/Matt, 200 Matt, 300 Gloss). Heavy stocks (250/300/350) and edge-to-edge stocks need SRA3 prices too — that's the parent sheet they're imposed from.

Photo papers and poster papers need their own size lists (4×6, 5×7, A2, A1, …) populated in `stocked_sizes` rather than a3/a4, otherwise the imposition engine can't price them.

### 3. Catalogue Finishing list still contains catalogue duplicates

The `cover` category in `catalog_finishing` (160gsm/250gsm/300gsm card covers, gloss/silk card covers, PVC, acetate, etc.) duplicates paper stocks that already live in `catalog_papers` with `is_cover_stock = true`. Covers should be priced as parent sheets via the papers table, not as a finishing line item.

`catalog_finishing_prices` is also sparse: 64 active finishing items but only 74 price rows, and most are `size_code = 'any'`. Anything that's truly per-sheet (lamination, slip sheets, dividers) needs A4 and A3 rows.

---

## The plan

### Step A — Decommission legacy rate-card paper & finishing

1. **Code first** — delete from `RateCardEditor.tsx` the "Paper Stocks" and "Finishing" tabs; only Clicks / Photo Prints / Business Cards remain.
2. Strip the hooks `useRateCardPapers`, `useUpsertRateCardPaper`, `useRateCardFinishing`, `useUpsertRateCardFinishing` (and delete/clone helpers) from `useRateCard.ts`.
3. Remove `calculatePriceFromRateCard`'s paper & finishing branches in `src/lib/calculatePrice.ts`; pricing for those routes through `catalog_*` only. `PriceSummary.tsx`, `OrderBuild.tsx`, `ProductRecipeTab.tsx`, `seedDefaultRecipes.ts` updated to stop joining rc_papers / rc_finishing.
4. **Then migration** — drop tables `rate_card_papers` and `rate_card_finishing` (cascade removes the 122k branch/tenant rows and the related `rate_card_price_breaks` pointing at them).

### Step B — Fix Catalogue Paper Prices

1. **Populate `stocked_sizes`** properly for paper families that aren't a3/a4:
   - Gloss Photo, Matt Photo → `{photo_4x6, photo_5x7, photo_6x8, photo_8x10, a4}`
   - Poster papers → `{a3, a2, a1, a0}`
   - Heavy stocks (250/300/350) → add `sra3` (and keep a4/a3 if cut down)
2. **Seed missing `catalog_paper_prices` rows** for every `(paper × stocked_size)` pair with a `0.00` placeholder and `is_active = true`, so the editor shows an empty input rather than dropping the row.
3. In the editor, replace the fixed `A4 / A3 / SRA3` column set with **columns driven by the paper's `stocked_sizes`** — so photo and poster papers show their own size columns instead of empty A4/A3.

### Step C — Trim & complete Catalogue Finishing

1. Migration: deactivate (`is_active = false`) every row in `catalog_finishing` with `category = 'cover'`. Covers are paper stocks now.
2. Migration: deactivate the duplicate `Card Cover (250gsm)` legacy variant rows that overlap your tidy `250gsm White / Gloss / Silk Card Cover` rows.
3. Seed missing `catalog_finishing_prices` placeholders so every active finishing item has at least one price row at its declared basis (per_unit → `any`; per_sheet → `a4` + `a3`).
4. Add a small "missing price" badge in the Finishing pricing tab so gaps are visible at a glance.

### Step D — Editor polish (Master Pricing page)

1. Page header restated: **Click Charges**, **Paper Stocks**, **Finishing**, **Photo Prints**, **Business Cards** — five sections, one source of truth each.
2. Add a "Coverage" line at the top of each catalogue tab: *"24 of 25 paper stocks priced · 1 missing"* with a filter toggle.
3. Re-order tabs so Catalogue (Papers / Finishing) sits above the rate-card section to mirror the master catalogue layout.

---

## Out of scope (flag if you also want these now)

- Re-pricing tenants and branches after the legacy tables are dropped (a separate "re-sync from master" pass per tenant).
- Actually setting the new SRA3 / photo / poster prices — I'll seed them as `0.00` so you can fill them in.
- Touching `rate_card_clicks`, `rate_card_photo_prints`, `rate_card_business_cards` — they're correct.

## Technical detail (for reference)

- Files edited: `src/components/pricing/RateCardEditor.tsx`, `src/components/pricing/MasterCatalogPricingEditor.tsx`, `src/hooks/useRateCard.ts`, `src/lib/calculatePrice.ts`, `src/components/order/PriceSummary.tsx`, `src/pages/dashboard/OrderBuild.tsx`, `src/components/admin/ProductRecipeTab.tsx`, `src/lib/seedDefaultRecipes.ts`.
- Migrations (in order): (1) drop `rate_card_papers`, `rate_card_finishing` + dependent FKs in `rate_card_price_breaks`; (2) update `catalog_papers.stocked_sizes` for photo/poster/heavy stocks; (3) deactivate `catalog_finishing` `cover` rows; (4) seed placeholder `catalog_paper_prices` and `catalog_finishing_prices`.
- Imposition map (`src/lib/pricing/impositionMap.ts`) needs photo and poster sizes added so the engine can pick parent sheets for those families.
