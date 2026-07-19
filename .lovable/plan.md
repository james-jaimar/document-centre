
## What we're solving

You are correct that the R124 is wrong for a 40pp A5 colour-duplex bound doc on 80gsm bond with comb binding. I traced every rand of it through the code + Demo3new's actual rate-card rows.

## Full rundown of the quoting engine (front to back)

There is one calculator, `src/lib/calculatePrice.ts`, called from both the customer configurator (`OrderBuild.tsx` → `PriceSummary.tsx`) and the branch/admin spec-quote builder (`QuoteSpecBuilder.tsx`). They now go through the shared `useItemPricing` hook we added last turn, so both sides see the same rate cards, overrides, sections, and tab bulk. Confirmed on Demo3new — quote and configurator both return R124 for that spec.

The calculator has three engines: `photo_prints`, `business_cards`, and the general **click-charges** engine (Bound Documents, Flyers with non-pack pricing, Presentations, etc.). Bound Documents uses click-charges. For click-charges each line is built like this:

1. **Section list** — from `spec.sections` (Body, Cover, Back Cover, Tab). Tab sections are zero-page but count toward binding bulk (2 sheets each).
2. **Clicks** — per section: duplex = `ceil(pages/2)` clicks, simplex = `pages`. Rate looked up via `resolveClickRate(finishedSize, colour, sides)`.
3. **Paper** — one line summing sheets across sections, priced via `resolvePaper(paperCode, finishedSize)`.
4. **Finishing** — required-by-recipe + customer-selected `catalog_finishing` rows.
5. **Binding** — from the selected option's `metadata.binding_method`; smallest spec in `binding_specifications` that fits `totalSheets + tabs×2` at 85% headroom; picks `comb-6mm` etc. from `catalog_finishing`.
6. **Product-option price impacts** — remaining flat/per-page/per-sheet options.

### The imposition map (this is where the R124 comes from)

Small sizes have no click / paper rows in the rate card — they are derived from a **parent sheet** via a **hardcoded map**:

```text
src/lib/calculatePrice.ts, line 534:
  SIZE_IMPOSITION = { A4→A3 nUp=2, A5→A3 nUp=4, A6→A3 nUp=8, DL→A3 nUp=6 }
```

So for A5, `resolveClickRate` and `resolvePaper` always fall back to the A3 row divided by 4, even when an A4 row exists that would be cheaper.

### Verified with Demo3new's actual data

Rate-card rows for `f691ce51-…` (Demo3new, tenant PostNet demo):

| Line | Row read | Per-piece math | Total |
|---|---|---|---|
| Clicks (A5 colour duplex, 20 clicks) | A3 colour duplex = R22.00, nUp=4 | 20 × (22/4) = 20 × R5.50 | **R110.00** |
| Paper (80gsm bond, 20 sheets) | 80gsm-bond A3 = R0.40, nUp=4 | 20 × (0.40/4) = 20 × R0.10 | **R2.00** |
| Comb binding (20 sheets → comb-6mm) | catalog_finishing comb-6mm = R12 | flat | **R12.00** |
| **Total** | | | **R124.00** |

Your expected math (deriving A5 from A4 instead of A3) using the same rows:

| Line | Row read | Per-piece math | Total |
|---|---|---|---|
| Clicks | A4 colour duplex = R8.50, nUp=2 | 20 × (8.50/2) = 20 × R4.25 | **R85.00** |
| Paper | 80gsm-bond A4 = R0.20, nUp=2 | 20 × (0.20/2) = 20 × R0.10 | **R2.00** |
| Comb | as above | | **R12.00** |
| **Total** | | | **R99.00** |

Paper happens to tie (R0.10/sheet either way). Clicks don't — A4-parent is R25 cheaper. That is the entire R25 gap between what you expect and what the engine returns. Binding, sheet count, and section normalisation are all correct.

## Root cause

Hardcoded parent in `SIZE_IMPOSITION`. On a digital press, the correct behaviour is "run it on whichever stocked parent yields the cheapest per-piece cost that is actually stocked in the rate card". The engine already knows how to check both — it just doesn't.

## Fix

### 1. `src/lib/calculatePrice.ts` — cheapest-parent selection

Replace the fixed `SIZE_IMPOSITION` lookup inside `resolveClickRate` and `resolvePaper` with a candidate list per finished size:

```text
CHILD_PARENTS = {
  A4 → [A4 direct, A3 nUp=2, SRA3 nUp=2]
  A5 → [A5 direct, A4 nUp=2, A3 nUp=4, SRA3 nUp=4]
  A6 → [A6 direct, A5 nUp=2, A4 nUp=4, A3 nUp=8, SRA3 nUp=8]
  DL → [DL direct, A4 nUp=3, A3 nUp=6, SRA3 nUp=6]
  A3 → [A3 direct, SRA3 nUp=1]
}
```

For clicks: iterate candidates, keep only rows that are `is_active` in the resolved (branch→tenant→master) cascade, compute `sell_price / nUp` per candidate, return the cheapest. Same logic in `resolvePaper` using `catalog_paper_prices` rows.

Retain the current `SIZE_IMPOSITION` shape as a fallback for `finishingNUp()` where SRA3 lamination logic already relies on it (that logic stays: per-sheet lamination is priced per SRA3 sheet regardless of clicks).

Return the picked parent's `sourceSize` + `nUp` from the resolver so the breakdown label can show it.

### 2. Breakdown labels — show what the customer is actually paying for

Right now the paper line reads `Paper: 80gsm-bond A3` × 20 sheets, which is confusing because they didn't order A3 paper. Change the label to make the imposition explicit:

- Clicks: `Print A5 colour duplex (2-up on A4)` → makes A5-from-A4 vs A5-from-A3 visible.
- Paper: `Paper: 80gsm Bond (4-up on A3, 5 parent sheets)` → so an admin auditing a quote can see how many parent sheets are billed at the run level.

Purely display; no math change beyond exposing what the resolver already returns.

### 3. Verification

Reproduce the reported spec on Demo3new (Bound Documents, comb, no covers, 80gsm bond, 40pp body A5 colour duplex, qty 1):

- Expected clicks: **R85.00** (A4 parent, 2-up)
- Expected paper: **R2.00** (either parent ties)
- Expected binding: **R12.00** (comb-6mm)
- **Expected total: R99.00**

Spot-checks to prevent regressions:

- A4 body: must keep pricing from A4 direct (never accidentally derive from A3 because A3 is "bigger").
- A6 / DL flyers on packs: unaffected (pack pricing bypasses this path).
- Business cards / Photo prints: unaffected (separate engines).
- Cover-only lamination on SRA3: still uses `finishingNUp` map (per-sheet parent logic untouched).
- Quote↔Configurator parity: both must still return the same number.

## Out of scope

- No rate-card row edits — this is engine logic only.
- No changes to pack pricing (Flyers), photo prints, business cards, or the finishing-parent SRA3 logic.
- No UI redesign of the breakdown popover beyond the two label strings above.

## Technical detail

- Files touched: `src/lib/calculatePrice.ts` only.
- The `useItemPricing` hook, `normaliseQuoteSections`, section-label handling, tab-bulk binding, branch/tenant override cascade, and rate-card resolution are all working correctly — verified by tracing the R124 back to each rate-card row on Demo3new. Do not touch them.
