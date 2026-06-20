## Where R29.20 comes from

I traced the calculation against the rate card:

```text
Sections built by OrderBuild for this flyer:
  • Front  — page_count=2, colour, duplex   →  ceil(2/2) = 1 click, 1 sheet
  • Back   — page_count=2, colour, duplex   →  ceil(2/2) = 1 click, 1 sheet
                                            ───────────────────
                                            2 clicks, 2 sheets

Clicks   : A4 colour duplex (derived from A3 R24 ÷ 2-up) = R12.00 × 2 = R24.00
Paper    : 130gsm Matt A3 (≈R5.20) ÷ 2-up                =  R2.60 × 2 =  R5.20
                                                          ──────────
Total per unit                                                    R29.20  ✓
```

So the click rate (R12) and paper rate are both correct. The bug is that the flyer is being **billed as two physical sheets** when a flyer is one sheet with two printed faces.

### Root cause

Multi-section pricing in `calculatePriceFromRateCard` (in `src/lib/calculatePrice.ts`) treats every section as its own stack of sheets. That is correct for booklets (Body + Cover are different paper stacks), but wrong for flyers — Front and Back are two **faces of one sheet**, not two sheets.

The flyer screen presents Front + Back as separate sections (so customers can upload two single-page PDFs and have them imposed onto one sheet), but the spec sent to the calculator carries them as two independent sections. The calculator then doubles every sheet-based cost: clicks, paper, and any per-sheet finishing such as lamination.

Compounding it: the user assigned the same 2-page PDF to **both** Front and Back, so each section reports 2 pages, which yields 1 duplex click per section instead of the expected 0.5 sheet. (A correct flyer assignment would be page 1 → Front, page 2 → Back, giving each section page_count=1.) Even with the correct assignment we still get 2 × (1 simplex click) = 2 clicks on 2 sheets, so the doubling exists at any assignment.

### Plan

Single-sheet products (flyers, posters, single-sheet handouts) must collapse Front + Back into one duplex billing unit before pricing runs. The change is scoped to spec construction — the calculator stays general.

1. **Flag single-sheet families.** Treat any product family whose `pricing_engine === 'click_charges'` and whose section model is "Front + optional Back" (currently: Flyers, Posters, single-sheet handouts) as single-sheet. Detect from `productFamily.slug ∈ {flyers, posters, handouts}` plus the existing flyer flag already used in `OrderBuild.tsx` (`isFlyerLikeFamily`). If that flag doesn't yet exist for posters/handouts, add it alongside `isSaddleStitchedFamily`.

2. **Collapse Front + Back into one duplex section in `computeBreakdown`** (around lines 711–733 of `src/pages/dashboard/OrderBuild.tsx`). For single-sheet families:
   - Combine the Front section and the Back section into **one** section with:
     - `label: undefined` (single section, no breakdown prefix needed)
     - `page_count: max(frontDocPages, backDocPages, hasBack ? 2 : 1)` — clamped to 2 when duplex, 1 when simplex
     - `is_duplex: hasBack` (Back section present → duplex; Front-only → simplex)
     - `is_color: front.is_color || back.is_color` (Mixed treated as colour to be safe; matches current per-section behaviour for the worst case)
   - This guarantees `clicks = is_duplex ? 1 : 1` sheet per flyer regardless of how many PDF pages the customer dropped in.

3. **No calculator changes.** `calculatePriceFromRateCard` already handles `sections: [oneDuplexSection]` correctly: 1 click × R12 (A4 colour duplex) + 1 sheet × R2.60 (130gsm Matt A3 ÷ 2-up) = **R14.60** for the example above.

4. **Optional guardrail (separate, not blocking).** Warn at upload time when a multi-page PDF is dropped onto a flyer's Front or Back slot — the customer probably meant a brochure. Out of scope for this fix.

### Verification

- Same 2-page PDF assigned to Front + Back, A4 130gsm Matt, qty 1 → expect **R14.60** (was R29.20).
- 1-page PDF on Front only (simplex), qty 1 → expect 1 simplex click (~R6) + 1 sheet (~R2.60) ≈ **R8.60**.
- 1-page on Front, 1-page on Back, qty 100 → 1 duplex click × R12 ÷ tier + 1 sheet, × 100; no doubling.
- Booklets / saddle-stitch / bound documents: unaffected — they don't hit the single-sheet branch.
- Lamination on a flyer: now bills 1 sheet (not 2), so the new SRA3 nUp logic still rounds the run to whole parent sheets correctly.

### Files to edit

- `src/pages/dashboard/OrderBuild.tsx` — single-sheet detection + section collapse in `computeBreakdown`.
- (No change to `src/lib/calculatePrice.ts`.)