

## The change

Defer thumbnail rasterization until **after** advisory dialogs (bleed, non-ISO size, presentation orientation) are resolved. Today we render at upload, then re-render after the user confirms a crop. That's wasted work and visible UI churn.

## Current flow (wasteful)

In `src/hooks/useDocumentUpload.ts > processDocument`:

1. Upload PDF
2. `createAsset({ auto_queue: true })` → backend immediately rasterizes full MediaBox
3. Poll thumbnail jobs
4. If `TrimBox ≠ MediaBox` → `cropRasterize` again (second render)
5. Poll again
6. Detect non-ISO / near-ISO bleed → write `preflight_data`
7. UI shows advisories; user confirms → `cropRasterize` (third render in bleed case)

So a PDF with manually-added bleed renders 2–3 times.

## New flow (single render)

### Phase A — Inspect only (no rasterization)

In `processDocument`:
1. Upload PDF.
2. `createAsset({ auto_queue: false })` — register asset, run metadata extraction job only (page count, boxes, dimensions). No thumbnails yet.
3. Poll the metadata job(s) to completion.
4. Read boxes, compute `pageWidthMm/pageHeightMm`, run `detectNonIsoSize` and `detectNearIsoWithBleed`.
5. Determine the **resolved render box** up front:
   - If `TrimBox` exists and differs from `MediaBox` → use TrimBox.
   - Else if non-ISO detected → leave as MediaBox for now; advisory will let user choose scale.
   - Else if near-ISO bleed detected → leave as MediaBox for now; advisory will let user confirm trim.
   - Else → MediaBox.
6. Write `documents` row with `document_status = 'awaiting_review'` when an advisory is pending, otherwise `'rendering'`. Persist `preflight_data` (boxes, detected_size, near_iso_match) so advisories show.
7. **No thumbnails rendered yet.** UI shows a placeholder card with the advisory chip.

### Phase B — Render once, after user decides (or auto-confirm)

Add a single helper `renderDocumentThumbnails(docId, assetId, box)` (extracted from current logic) that:
- Calls `cropRasterize(assetId, box, 150)` exactly once.
- Polls until thumbnails are ready (existing stale-poll logic).
- Updates `documents` with `thumbnail_urls`, finalised dimensions, `document_status = 'ready'`.

Trigger points for Phase B:
- **No advisory** → call immediately at end of Phase A with the resolved MediaBox/TrimBox. Single render, same outcome as today's happy path.
- **Bleed advisory confirmed** (`handleBleedConfirm` in `OrderFiles.tsx`) → call with computed trimmed box. Replace today's `cropRasterize` + `reThumbnail` pair with one `renderDocumentThumbnails` call.
- **Bleed advisory dismissed** ("No, keep as is") → call with MediaBox.
- **Non-ISO size advisory** → call with the chosen target box (existing scale-to flow).
- **Presentation orientation advisory** → call after rotation handler with new MediaBox.

### Phase C — UI surfaces the new "awaiting review" state

In `OrderFiles.tsx` and the file/section list:
- Show a small "Reviewing dimensions…" / advisory chip on cards whose `document_status === 'awaiting_review'`.
- Suppress thumbnail skeletons that imply rendering is in progress until Phase B starts.
- Existing advisory dialogs already drive Phase B; just route them through the new single-render helper.

### Phase D — Cleanup

- Delete the now-redundant `reThumbnail` re-crop branch that re-reads `TrimBox/CropBox/MediaBox` (it was the source of the previous bleed bug too).
- Keep `reThumbnail` only as a thin wrapper that calls `renderDocumentThumbnails` for the rotate / scale flows.

## Backend assumption to confirm

`createAsset({ auto_queue: false })` must register the asset and return `asset_id` with the metadata extraction job (boxes, page count) but skip thumbnail rasterization. Looking at `documentCentreApi.ts` will confirm whether the API already supports this; if `auto_queue` only controls thumbnail jobs we're fine, otherwise we'll instead call `createAsset` then explicitly trigger only the metadata job (or simply skip the rasterize path until we call `cropRasterize`).

## Files to change

- `src/hooks/useDocumentUpload.ts` — split `processDocument` into `inspectDocument` (Phase A) and `renderDocumentThumbnails` (Phase B). Stop double-cropping.
- `src/pages/dashboard/OrderFiles.tsx` — `handleBleedConfirm`, non-ISO scale handler, presentation rotation handler all call `renderDocumentThumbnails` directly. Remove the now-redundant `reThumbnail({ skipCrop: true })` workaround.
- `src/components/order/FileList.tsx` (and section list if needed) — render the `awaiting_review` state.
- Possibly `src/lib/documentCentreApi.ts` if we need a metadata-only entry point.

## Verification

1. Upload an A4 PDF with no bleed → renders once → preview appears, no advisories.
2. Upload a 160×230mm PDF (A5+bleed, no TrimBox) → no thumbnail rendered, bleed advisory appears → confirm → single render → trimmed preview shows.
3. Upload a US Letter PDF → no thumbnail rendered, non-ISO advisory appears → choose "Scale to A4" → single render at A4.
4. Upload a portrait Presentation → orientation advisory → confirm rotate → single render landscape.
5. Bleed dismissed ("keep as is") → single render at MediaBox.
6. Network tab: confirm only one `cropRasterize` call per upload in every path above.

