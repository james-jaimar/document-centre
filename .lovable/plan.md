# Master Pricing — fix Cover badge & "—" cells

Two changes: tidy the master catalogue data so the flags reflect the rule "all 170gsm+ stocks are cover-capable", and turn this screen into something you can actually edit from instead of bouncing to Master Catalogue → Papers.

## 1. Data cleanup (one-off migration on `catalog_papers`, master rows only)

**Cover flag** — set `is_cover_stock` strictly by weight:

- `weight_gsm >= 170` → `is_cover_stock = true`
- `weight_gsm < 170` → `is_cover_stock = false`

Net effect vs today:

| Paper | gsm | Today | After |
|---|---|---|---|
| Standard Poster Paper (Satin) | 120 | Cover | — |
| 170gsm Gloss | 170 | Cover | Cover |
| 170gsm Matt | 170 | — | Cover |
| 200gsm Gloss | 200 | — | Cover |
| 200gsm Matt | 200 | Cover | Cover |
| Photo / Premium Poster Papers | 200 | — | Cover |
| 250gsm Gloss / Matt | 250 | partial | Cover |
| 300gsm Gloss / Matt | 300 | partial | Cover |
| 350gsm Gloss / Matt | 350 | partial | Cover |

**SRA3 stocked sizes** — add `sra3` to `stocked_sizes` for every active 170gsm+ paper that doesn't already have it (170gsm Gloss, 170gsm Matt). Poster papers stay on `[a3, a2, a1, a0]` — SRA3 doesn't apply to them.

**Seed missing price rows** — for any newly-stocked size (e.g. 170gsm Gloss SRA3) insert a `catalog_paper_prices` row with `0.00` so the cell renders as an editable input.

## 2. Inline editing on the Master Pricing screen

File: `src/components/pricing/MasterCatalogPricingEditor.tsx` (`CatalogPapersPricing` only).

**Cover badge becomes a toggle.** Click the "Cover" pill to flip `is_cover_stock` on that paper (optimistic update + toast on failure). Same treatment for "SRA3-only".

**"+ Add" affordance on non-stocked size cells.** Instead of the faint "—", every column in `allSizes` that the paper doesn't stock renders a small ghost button labelled `+`. Clicking it:

1. Appends that size to the paper's `stocked_sizes` array.
2. Inserts a `catalog_paper_prices` row with `0.00`.
3. The cell re-renders as a normal editable input ready for the price.

Removing a size — clearing the price input already deletes the price row. We'll add a tiny "×" overlay on a stocked cell (visible on hover) that also strips the size from `stocked_sizes`. Skipped if you'd rather keep that to the catalogue editor — say the word.

**Scope guard.** Inline editing only works on the master scope (`scope === "master"`). On tenant/branch scopes the badges stay read-only and `+ Add` is hidden, because their papers cascade from master.

## 3. Hooks

Add two small mutation hooks in `src/hooks/useCatalog.ts` (or alongside it):

- `useUpdateCatalogPaper(scopeArgs)` — partial update of `is_cover_stock`, `is_edge_to_edge_only`, `stocked_sizes`. Invalidates the papers query.
- No new finishing hook needed.

## Technical notes

- The migration is data-only on `public.catalog_papers` and `public.catalog_paper_prices`; no schema change, no new tables, no new RLS.
- `tenant_id IS NULL` filter on every UPDATE so only master rows are touched. Tenants/branches pick the changes up via the existing "Pull missing from master" button.
- The `+ Add` cell uses the same `useUpsertCatalogPaperPrice` mutation already in the editor; it just calls the paper-update hook first, then the price upsert.

## Out of scope

- No changes to `RateCardEditor`, finishing prices, or pricing engine.
- Not auto-setting actual SRA3 prices — they seed at `0.00` and you fill them in.
- Not changing the Master Catalogue → Papers editor.
