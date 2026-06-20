## Root cause

`CatalogSizeSelect` lists catalogue sizes with `value={s.code}` — and the catalogue stores `code` as a lowercase slug ("a2", "a4-landscape", "us-letter") while the human label lives on `s.label` ("A2", "A4 Landscape", "US Letter").

When you add a Click Charge row:
1. The picker writes the **slug** into `adding.size` (e.g. `"a2"`).
2. `saveAdd` inserts that string into `rate_card_clicks.size`.

The previous pass only papered over this:
- `saveAdd` does `adding.size.trim().toUpperCase()` → fine for `"a2"` → `"A2"`, but produces `"A4-LANDSCAPE"`, `"US-LETTER"`, `"SRA3"` (already-upper stays upper but hyphenated slugs are still wrong).
- The Clicks table cell does `String(row.size).toUpperCase()` for the same reason.
- `useRateCard.ts` finishing-prices adapter (line 295) does `String(fp.size_code).toUpperCase()` — same band‑aid.

The real cause: **we're persisting a URL slug into a column that is supposed to hold a human-readable size label.** The hack only works for plain A‑series codes; it silently corrupts anything else, and any new lowercase slug introduced to `catalog_sizes` will reappear in pricing rows.

## Fix (at the cause)

1. **`src/components/pricing/RateCardEditor.tsx` — Clicks tab**
   - In `saveAdd`, look up the chosen catalog row from the loaded `sizes` list using `adding.size` (the slug) and persist:
     - `size: matched.label` (the canonical display name, e.g. `"A2"`, `"A4 Landscape"`)
     - `catalog_size_code: matched.code` (the FK already added in migration `20260614102633…`)
   - Remove the `.toUpperCase()` hack.
   - In the table cell, render the label resolved from the catalog: prefer `sizes.find(s => s.code === row.catalog_size_code)?.label`, fall back to `sizes.find(s => s.code.toLowerCase() === String(row.size).toLowerCase())?.label`, then `row.size` as final fallback. Remove the `.toUpperCase()` call.
   - Use the same resolved label in the `TiersButton` `label={…}` prop so tier dialogs stop showing slugs.

2. **`src/hooks/useRateCard.ts` — finishing adapter (line 295)**
   - Drop `String(fp.size_code).toUpperCase()`; resolve `fp.size_code` to its catalog label the same way (the adapter already has access to the catalog rows via `useCatalogSizes`/`useResolvedCatalogOptions` consumers — pass the label through). If a quick label lookup isn't available in that scope, expose a small helper `labelForSizeCode(code, sizes)` in `src/hooks/useResolvedCatalogOptions.ts` (or co-located) and use it in both files.

3. **Do not touch existing rows.** Per your instruction, no retroactive DB cleanup. New rows from this point will store the proper label; the display path will also gracefully render the correct label for any legacy slug-stored rows via the catalog lookup.

## Out of scope

- Photo Prints (`size_slug`) — that column is intentionally a slug and is already displayed separately as `font-mono`.
- Master Catalogue paper/finishing editors — they already store the catalog FK; no slug leakage observed there.
- `catalog_sizes.code` itself — slugs are legitimate as stable identifiers; the fix is to stop confusing slug with label downstream.

## Verification

- Add a new Click Charge row for **A2 mono simplex** → DB stores `size = 'A2'`, `catalog_size_code = 'a2'`; the row renders as `A2` immediately.
- Add a row for **A4 Landscape colour duplex** → DB stores `size = 'A4 Landscape'` (no more `A4-LANDSCAPE`).
- Existing `"a2"` row still renders as `A2` because the display path resolves via the catalog.
- Tier dialog title shows `A2 · mono · simplex`, not `a2 · mono · simplex`.