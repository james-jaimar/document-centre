# Why the rotated document still appears landscape

## Root cause

In `src/pages/dashboard/OrderFiles.tsx` (`handleRotateOrientation`, ~line 650), the flow is:

1. Call `rotate(backendAssetId, 90)` and `pollJob(...)` — the VPS produces a rotated PDF.
2. Immediately call `renderWithProgress(...)` which calls `getAsset(assetId)` and uses `asset.width_pt` / `asset.height_pt` to write `page_width_mm` / `page_height_mm` into the `documents` row (see `src/hooks/useDocumentUpload.ts` lines 116, 217–218, 244–245).

The problem: the rotate operation produces a rotated PDF on the VPS, but the **asset's cached metadata (`width_pt`, `height_pt`, `boxes.MediaBox`) is not automatically refreshed**. Without a follow-up `inspectAsset(...)` call, `getAsset()` returns the **pre-rotation** dimensions. So:

- `documents.page_width_mm/page_height_mm` get re-written with the **old** landscape values.
- The thumbnails on disk are the rotated portrait images, but the row's reported dimensions still say landscape — and any downstream code (preview aspect ratio, OrderBuild size auto-match, the Configure preview that picks layout based on landscape vs portrait) reads the row and renders landscape.
- That also explains why short-edge binding logic and the OrderBuild preview never switched: they're reacting to the (still-landscape) row dimensions.

This matches the screenshots: thumbnail shows a portrait crop attempt (because the rasterizer used the rotated PDF), but the surrounding card and Configure step still treat it as 297×210 landscape.

## Fix

Re-inspect the asset after rotation, then render. Concretely, in `handleRotateOrientation`:

1. After `await pollJob(job_id)` for the rotate job, call `await inspectAsset(orientationDoc.backendAssetId)` and `pollJob(...)` it. This makes the VPS re-read the rotated PDF and update its cached `width_pt`, `height_pt`, `boxes`, `page_count`.
2. Then call `renderWithProgress(...)` exactly as today — `getAsset()` will now return the rotated (portrait) dimensions and `renderDocumentThumbnails` will write the correct `page_width_mm` / `page_height_mm` into the `documents` row.
3. Keep the existing `preflight_data` cleanup (`orientation_resolved: true`, `orientation_action: "rotated"`, removal of `orientation_mismatch`) and the `refetchDocuments()` call.

Also defensively swap `page_width_mm`/`page_height_mm` in the `documents` update at the end of `handleRotateOrientation` (using the original `orientationDoc.widthMm`/`heightMm` swapped) as a fallback in case `renderWithProgress` finishes its DB update before the row is re-read — this guarantees the UI never sees stale dims.

## Files to change

- `src/pages/dashboard/OrderFiles.tsx` — add `inspectAsset` import, insert re-inspect step inside `handleRotateOrientation` between `pollJob` and `renderWithProgress`, and add the swapped-dimensions fallback to the `documents` update.

## Acceptance check

After clicking "Rotate 90° to Portrait" on a 297×210 landscape PDF uploaded to Bound Documents:
- File card shows 210×297mm and a portrait thumbnail.
- Preview pane renders portrait.
- Configure step (OrderBuild) auto-matches A4 Portrait and uses long-edge binding.
- No second advisory pops up because `orientation_mismatch` is cleared.
