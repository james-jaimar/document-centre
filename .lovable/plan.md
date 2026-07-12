## Goal

For **Flyers only**, use the uploaded PDF's page count to decide which Print Sides options are shown and which one is pre-selected — so a customer uploading a 1-page file never sees (or gets defaulted to) double-sided pricing.

## Rule

Let `uploadedPages = sum(documents[].page_count)` for the current order item.

- `uploadedPages <= 1` → only offer **Single-sided** (hide Double from the selector and the pack picker).
- `uploadedPages >= 2` → only offer **Double-sided** (hide Single).
- `uploadedPages == 0` (nothing uploaded yet) → fall back to current behaviour (show whatever the ladder offers, default to first).

Applies **only** when `familySlug === "flyers"` AND the family is in `blocks` quantity mode. Every other family keeps today's behaviour untouched.

## Changes

### 1. `src/pages/dashboard/OrderBuild.tsx`

- Compute `uploadedPages` from `documents` (already in scope, already used at L328–331).
- Derive a `preferredSides: "single" | "double" | null` — non-null only for Flyers with `uploadedPages > 0`.
- In the pack-seed `useEffect` (L815–875), replace the `sides[0]` default with: if `preferredSides` is set and present in `sides`, use it; otherwise keep the existing `mappedCurrent ?? sides[0]` logic.
- Pass `preferredSides` (or an equivalent `allowedSides: string[]`) into `OptionsPanel` and `PriceSummary`.

### 2. `src/components/order/OptionsPanel.tsx`

- Add optional prop `allowedSides?: string[]` (case: `["single"]` or `["double"]`).
- In the `sidesValues` memo (L154–161), intersect with `allowedSides` when provided and non-empty. Existing "hide the row entirely when only one side is available" behaviour (L196 `sidesValues.length > 1`) then naturally hides Print Sides when it's forced by the upload.

### 3. `src/components/order/PriceSummary.tsx`

- Accept `allowedSides?: string[]` and, when provided, treat `specSides` as the single allowed value regardless of what's on `spec.selected_options`. This guarantees the quantity dropdown lists only rows that match the inferred sidedness even during the tick before OrderBuild's seed effect settles.

### Out of scope

- No DB / schema / migration changes.
- No changes to any other family (Bound, Ring, Brochures, Presentations, Business Cards, Photo, Loose Sheets, Booklets).
- No changes to pricing math, `resolvePackPricing`, cart snapshots, preview rendering, or the recent trim-crop fixes.
- No auto-mirroring back to `is_duplex` beyond what the existing L412–448 effect already does — it already syncs whatever ends up in `Print Sides`.

## Verification

1. Flyers, upload a 1-page A5 PDF → Print Sides row is hidden (or shows only Single-sided); quantity dropdown lists only single-sided pack rows; price matches the single-sided ladder.
2. Flyers, upload a 2-page A5 PDF → only Double-sided offered; pricing uses the double-sided ladder.
3. Flyers with no upload yet → behaviour unchanged (both sides visible if the ladder has both, default is the first row as today).
4. Bound Documents / Brochures / Business Cards → no change to their option lists or defaults.
