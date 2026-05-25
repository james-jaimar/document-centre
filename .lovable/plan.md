# Fix address overflow in quote PDF boxes

## Problem

In `Quote-Q-00003.pdf` the branch address line "Shop L38B, Ground Floor Entrance 7, Corner 5th & Rivonia Road, Sandton City" extends past the right border of the "Quote From" box. The renderer is drawing each address line as a single `drawText` call with no width constraint, so any line longer than the box wraps visually outside the border instead of onto a new line.

The same bug will hit "Quote To" and "Deliver To" whenever a customer or delivery address line is long.

## Fix

In `supabase/functions/quote-pdf/index.ts`:

1. Add a small `wrapText(text, font, size, maxWidth)` helper that greedily splits on spaces (and hard-breaks any single token longer than `maxWidth`) and returns an array of lines.
2. In the box renderers for Quote From / Quote To / Deliver To:
   - Compute `innerWidth = boxWidth - 2 * paddingX` once per box.
   - For every address / name / contact line, run it through `wrapText` and draw each returned line on its own row, advancing `y` by the line height each time.
   - Track the running `y` so the box height grows to fit wrapped content instead of clipping.
3. Make the three boxes share the same computed height (max of the three) so the row stays visually aligned, as it does today.
4. Re-check the "Tel / Fax / EMail" rows — they use a label column plus a value column. Apply the same wrap to the value column using `innerWidth - labelColWidth`.

## Out of scope

- No layout, totals, footer, branding, or filename changes.
- No schema or hook changes.

## Files touched

- `supabase/functions/quote-pdf/index.ts` — add `wrapText`, apply it inside the three address boxes and grow box height to fit.

## Verification

Redeploy `quote-pdf`, regenerate Q-00003, rasterise page 1 at 150 DPI and confirm the Sandton City address line wraps cleanly inside the Quote From border, and that Quote To / Deliver To still render correctly for short content.
