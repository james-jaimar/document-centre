## Problem
`src/lib/paperSizes.ts` lists ISO sizes A5→A0 but is missing **DL** (99 × 210 mm) and **A6** (105 × 148 mm). A DL flyer upload is therefore flagged "Unrecognised Paper Size" even though the branch catalogue allows DL.

## Fix (single file: `src/lib/paperSizes.ts`)

1. **Add DL and A6 to `ISO_SIZES`** so `matchIsoSize` / `detectNonIsoSize` recognise them as standard sizes and the advisory no longer fires.
   - `A6`: 105 × 148 mm
   - `DL`: 99 × 210 mm
   - Order: A6, A5, DL, A4, A3, A2, A1, A0 (keep canonical ordering; DL slots next to A5 since they share the 210 mm long edge).

2. **Add `dl` and `a6` entries to `ALL_KNOWN_SIZES`** so `getTargetDimensions("dl")` resolves for downstream production processing.

3. **Guard `getSuggestedIsoSizes` and `detectNearIsoWithBleed`** against DL side-effects:
   - Exclude DL from the area-ratio suggestion list (DL is a specialty format, not a scale target — the branch catalogue decides whether DL is offered).
   - Exclude DL from the near-ISO-with-bleed candidate loop (its 99 mm width is close to A6/A5 short edges and could false-match).
   - A6 stays in both — it's a normal member of the A-series.

## Out of scope
- No DB migration, no catalogue changes — DL is already a valid catalogue option; this only teaches the client to recognise it.
- No changes to the advisory modal UI itself.
