## What's happening

The R201 → R575 jump is not the cover option's "+R6,00/doc". It is a page-count bug introduced by the auto cover split.

Confirmed in `src/pages/dashboard/OrderBuild.tsx` (line ~1131), where the pricing spec is built:

```
page_count: docPages(s.document_id)
```

Every printable section is given the **whole document's** page count, ignoring `page_range_start` / `page_range_end`.

Before selecting a printed cover there is one section (Body = 28 pages) → billed 28 pages.
After the split there are three sections (Front Cover, Body, Back Cover) — all pointing at the same 28-page PDF — so the engine bills 28 + 28 + 28 = 84 pages of clicks and paper. That's roughly a 3× jump, matching R174,80 ex-VAT → R500,40 ex-VAT.

The split itself is correct in the database (front = pages 1–2, body = 3–26, back = 27–28); only the pricing projection is wrong.

## Fix

1. **Respect page ranges in `pricingSpec`** (`OrderBuild.tsx`): compute each section's page count as
   `min(page_range_end, docPages-1) - max(page_range_start, 0) + 1`, falling back to the full document page count only when both range fields are null (the pre-split / multi-file case). Post-split totals then come to 2 + 24 + 2 = 28.

2. **Bill the cover on its own stock.** Currently `calculatePriceFromRateCard` bills one paper line for all sheets at the body paper rate, so the 2 cover sheets are charged as 80gsm Bond and the cover uplift comes solely from the option's per-doc price impact. Split the paper line: sheets belonging to cover sections are billed against the cover stock rate (resolved from the section's `paper_stock` / `paper_weight_gsm`, e.g. `250gsm-silk`), and the remaining sheets against the body stock. Where the option's price impact already represents the full cover charge, the option impact stays as-is and only the paper allocation changes — I'll surface both lines in the breakdown so it's auditable.

3. **Carry the section stock through to pricing**: `pricingSpec` sections currently expose only `label / page_count / is_color / is_duplex`; add optional `paper_code` / `paper_weight_gsm`, and use it in step 2. Also handles the odd-page case (back cover = 1 page, simplex).

## Verification

- 28-page A5 job, no cover: price unchanged (R201,02 incl VAT).
- Same job with Printed Cover (250gsm Silk): expect roughly R201 + cover-stock delta on 2 sheets + the R6,00/doc option impact — order of R215–R225 incl VAT, not R575.
- Multi-file uploads (separate cover file) and tab/insert jobs: unchanged, since those sections have null page ranges.
- Add a unit test in `src/test/` covering the split spec so the triple-count cannot regress.

## Technical notes

Files touched: `src/pages/dashboard/OrderBuild.tsx` (pricingSpec), `src/lib/calculatePrice.ts` (per-section paper allocation, `ItemSpecSection` type), plus a new test. The admin/branch quote builder shares `useItemPricing.ts` → `calculatePriceFromRateCard`, so it inherits the fix.
