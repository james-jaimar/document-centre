## Problem

Today the orientation advisory fires *after* every page has been rasterised. For a 200‑page landscape PDF dropped into Bound Documents, the user waits for the full thumbnail render before seeing "Landscape Document Detected". The dimensions are actually known much earlier — right after the inspect job in Phase A — so we should treat orientation mismatch the same way we already treat size / bleed advisories: gate Phase B (rendering) on it.

## Current pipeline (`src/hooks/useDocumentUpload.ts`)

1. **Phase A — `inspectExistingAsset`** (runs after upload + LibreOffice convert if needed):
   - Inspects the asset, gets `boxes`, `width_pt`, `height_pt`, `page_count`.
   - Writes `page_width_mm`/`page_height_mm` to the `documents` row.
   - Sets `hasAdvisory = !!detectedSize || !!nearIsoMatch` (line 459).
2. **Phase B — `renderDocumentThumbnails`**: only runs immediately if `!hasAdvisory` (line 723). Otherwise deferred until the user clears the advisory dialog in `OrderFiles`.

The orientation check in `OrderFiles.tsx` (lines 303–338) currently watches `documents` and reacts when dimensions appear — but because rendering is *not* gated on it, by the time it fires, the rasterisation is already done (or well underway).

## Fix

Treat orientation mismatch as a first-class advisory in Phase A.

### 1. `src/hooks/useDocumentUpload.ts`

- Add an `orientationMismatch` detector inside `inspectExistingAsset` that uses the `productFamilySlug` already passed into `useDocumentUpload`:
  - `presentations` + portrait file (`w < h`) → mismatch (`to-landscape`).
  - `bound-documents` / `ring-binders` / `booklets` + landscape file (`w > h`) → mismatch (`to-portrait`).
  - Use the same `PORTRAIT_FAMILIES` set the OrderFiles effect uses; centralise it in a small constant at the top of the hook so the two callsites stay in sync.
- Fold it into `hasAdvisory`:
  ```ts
  const hasOrientationAdvisory = computeOrientationMismatch(productFamilySlug, finalWidthMm, finalHeightMm);
  const hasAdvisory = !!detectedSize || !!nearIsoMatch || hasOrientationAdvisory;
  ```
- Persist the flag into `preflight_data` so the OrderFiles effect can find it without re-deriving:
  ```ts
  if (hasOrientationAdvisory) preflight.orientation_mismatch = mode; // "to-portrait" | "to-landscape"
  ```
- Effect: when orientation is wrong, Phase B (`renderDocumentThumbnails`) is *skipped*, the upload card flips to "Awaiting your review…" at ~95% (existing behaviour for advisories), and the dialog opens immediately after Phase A — typically within 2–5s instead of after a full render.

### 2. `src/pages/dashboard/OrderFiles.tsx`

- Adjust the orientation `useEffect` (around lines 303–338) so it also reads `preflight_data.orientation_mismatch` to find candidates. The dimension-based check stays as a fallback for legacy docs uploaded before this change. Picking the candidate via the persisted flag avoids a tiny race where the React Query cache hasn't refreshed dimensions yet.
- After the user picks **Rotate** (`handleRotateOrientation`) or **Switch Product**, clear `preflight_data.orientation_mismatch` along with the existing `awaiting_review: false, orientation_resolved: true` write so the candidate selector won't re-fire.
- After the user picks **Dismiss**, set `orientation_resolved: true` (currently the dialog just closes) so the deferred render still kicks off — otherwise the document would sit forever at "Awaiting review". Use the same render trigger pattern as the bleed/size "keep" branches: call `renderWithProgress(doc.id, assetId, null, fileName)` and persist `orientation_action: "kept"`.

### 3. Touch-ups

- Office (DOCX/PPTX) path already calls `inspectExistingAsset` after conversion (line 700), so it picks up the new logic for free — exactly the "convert first, then inspect, then advise before rendering" sequence you described.
- No changes to `renderDocumentThumbnails`, `OrientationAdvisory.tsx`, or any preview code needed.

## Files to edit

- `src/hooks/useDocumentUpload.ts` — add orientation detection inside `inspectExistingAsset`, fold into `hasAdvisory`, write `preflight_data.orientation_mismatch`.
- `src/pages/dashboard/OrderFiles.tsx` — read `orientation_mismatch` flag in the candidate effect; wire the **Dismiss** branch to trigger the deferred render and clear the flag on Rotate / Switch / Dismiss.

## Result

Landscape PDF dropped into Bound Documents (or a portrait PDF dropped into Presentations):
1. Upload → S3 (~1–2s).
2. Inspect job → dimensions known (~2–4s).
3. Advisory fires immediately. **No thumbnails rendered yet.**
4. User chooses Rotate → server rotates, *then* renders thumbnails of the corrected document — saving the redundant pre-rotation render entirely.
