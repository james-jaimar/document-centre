## Problem

Click-charge rows for A0/A1/A2 were saved with the catalogue size *code* (lowercase slug: `a0`, `a1`, `a2`), while older rows are uppercase (`A3`, `A4`, …). The pricing engine upper-cases `finishedSize` and (since the last fix) upper-cases `c.size` too, so the lookup *should* match — but the inconsistency is fragile and shows up in the UI (lowercase rows in the screenshot). We will normalise everything to uppercase, on save *and* in the database, and confirm posters actually pick up the rate.

## Plan

1. **Normalise on save (clicks tab, `src/components/pricing/RateCardEditor.tsx`)**
   - When inserting a new click row (and any inline edit), uppercase `size` before writing: `size: adding.size.trim().toUpperCase()`.
   - Render `row.size` as `row.size.toUpperCase()` so legacy lowercase rows display consistently while the migration runs.

2. **One-shot DB migration**
   - `UPDATE public.rate_card_clicks SET size = UPPER(size) WHERE size <> UPPER(size);`
   - Scope-agnostic (covers master, tenant, branch rows).

3. **Keep the case-insensitive comparator in `calculatePrice.ts`** as a belt-and-braces safety net (already in place from the previous turn).

4. **Verify**
   - Quote a Poster at A2 / A1 / A0 (Colour, Simplex) and confirm the breakdown now contains the click line at R 40 / R 80 / R 160 plus the matching paper line.
   - Re-quote an A3 poster to confirm no regression.
   - Reload the Master Pricing → Click Charges tab and confirm all rows render uppercase.

## Out of scope

- No changes to paper/finishing lookup (already catalogue-driven and verified last turn).
- No changes to the catalogue size codes themselves (they remain lowercase slugs — that's their contract).
