## Short answer

No — the calculator currently does **not** account for parent-sheet imposition on finishing. Lamination is priced per SRA3 in the rate card, but the engine multiplies that SRA3 unit price by `totalSheets`, where `totalSheets` is counted in **finished-size sheets per book** (e.g. A5), not parent SRA3 sheets, and is **not** divided by ups or rounded to whole parent sheets across the run.

It does this correctly for **paper** and **clicks** (both divide by `nUp` and `Math.ceil` to whole parent sheets across the run). Finishing was missed.

### Worked example — your 28pp A5 booklet, 1 copy, gloss lam one-side (R2.00/SRA3 in your rate card)

- Cover is 4pp duplex A4 (printed 2-up on SRA3, so 1 SRA3 sheet yields 2 covers).
- Engine today: `coverSheets (A5-counted) × R2.00 × qty` → counts 2 "sheets" per book → bills R4.00 for 1 booklet.
- Reality / your expectation: 1 SRA3 minimum → R2.00 for 1 booklet; still R2.00 up to 2 booklets; R4.00 at 3-4; etc.

Same wrong math affects: matt lam, gloss lam DS, any other `pricing_basis = per_sheet` finishing that's actually priced per parent sheet.

## What I'll change

All changes in `src/lib/calculatePrice.ts` (rate-card engine, `calculatePriceFromRateCard`). No DB migrations needed — the data is already there (`catalog_finishing_prices.size_code = 'sra3'` and the existing `SIZE_IMPOSITION` table that powers paper/clicks).

1. **Make `per_sheet` finishing parent-sheet aware.**
   - When a finishing row's `size_code` (or rate-card row size) is a parent stock (e.g. `sra3`, `a3`) larger than the finished size, look up `nUp` from the same `SIZE_IMPOSITION` map already used for paper.
   - Replace the current `multiplier = totalSheets; then × quantity` with:
     `parentSheets = max(1, ceil(sectionSheets × quantity / nUp))`
     then divide back to per-unit: `unit = sell_price; multiplier = parentSheets / quantity` (preserving the existing breakdown shape) **or** emit a single run-level line — pick whichever keeps the popover readable; I'll use the same pattern paper uses (per-unit amount + per-book multiplier shown, run-level rounded under the hood).

2. **Scope cover-only finishes to cover sheets.**
   - Lamination, spot UV, foil, etc. apply to the cover, not the body. Today the engine multiplies by `totalSheets` (whole book).
   - Detect "cover" scope from either the option metadata (`metadata.scope = 'cover'`) or the section label (`"Cover"` / `"Outside"` / `"Inside"`). When scope = cover, use just `coverSheets`; otherwise fall back to `totalSheets`.
   - This applies to both the finishing-slot branch (lines ~665) and the product-option `per_sheet` branch (lines ~872).

3. **Minimum 1 parent sheet per finishing line.**
   - Already implied by `max(1, …)` but I'll make it explicit and document it — so qty=1 of a 4pp cover never bills less than one SRA3 lamination sheet.

4. **Preserve tiered pricing.**
   - `tieredUnit(...)` lookup will use the run-level `parentSheets` total (matching how paper and clicks already do it).

5. **Sanity-clamp non-`per_sheet` bases.**
   - `per_unit`, `per_page`, `per_set`, `per_cut`, `per_document` are unchanged — they're already correct.

## Out of scope (flagging, not fixing now)

- **Multi-section parent batching.** If a future job has two different cover stocks both laminated, today each would round to its own min-1 SRA3. That matches shop reality (different stocks ≠ same lam run), so leaving it.
- **Finishing rows priced per non-SRA3 parent** (e.g. an A3-only finish). The fix above handles this generically via `SIZE_IMPOSITION`, but I won't add new parent codes beyond what's already mapped (A3, SRA3).
- **Admin UI exposure.** No changes to the master pricing editor; the SRA3 row you already set is what gets used.

## Verification

- Manual: open the booklet configurator with a 28pp A5, cover = gloss lam 1-side, qty 1 → expect R2.00 lam line (was R4.00). Qty 3 → R2.00. Qty 5 → R4.00. Qty 100 → R50.00 (ceil(100/4) = 25 SRA3 sheets).
- Body-applied per-sheet finish (e.g. hypothetical full-book lam) still scales off body sheets, divided by ups.
- Existing paper/click numbers unchanged.
