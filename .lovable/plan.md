

## Issue

After the inspect/render split, when the user confirms a bleed/non-ISO/orientation advisory and Phase B (`renderDocumentThumbnails`) runs, there's **no progress indicator**. The dialog closes, the user sees a static "Trimming…" button momentarily, then nothing until the thumbnail eventually appears.

The progress modal (`UploadProgressModal`) was previously driven by `uploads` state in `useDocumentUpload`. Now that rendering happens *after* upload completes (triggered by the advisory handlers in `OrderFiles.tsx`), the upload entry is already marked `done` and the modal doesn't reflect the new render work.

## Fix

Re-use the same `uploads` progress channel for post-advisory renders so the existing `UploadProgressModal` shows live progress during Phase B.

### 1. Expose a progress-aware render trigger from the hook

In `src/hooks/useDocumentUpload.ts`, add a new function `renderWithProgress(docId, assetId, box, fileName)` that:

- Re-opens the `uploads[fileName]` entry: sets `status: "analyzing"`, `progress: 50`, `statusText: "Trimming and rendering pages…"`.
- Calls `renderDocumentThumbnails(docId, assetId, box, { onProgress })` — the existing helper already accepts an `onProgress` callback that updates message + percentage.
- On completion sets `status: "done"`, `progress: 100`.
- On error sets `status: "error"`.

Export it from the hook return alongside `reprocessDocument`.

### 2. Wire advisory handlers in `OrderFiles.tsx` to use it

Replace the direct `renderDocumentThumbnails(...)` calls inside:

- `handleBleedConfirm` (trim to ISO with bleed)
- `handleScaleTo` (non-ISO scale)
- `handleRotateToLandscape` (presentation rotation)
- `handleKeepOriginal` (dismiss → render at MediaBox)
- Custom-bleed handler

…with `renderWithProgress(doc.id, assetId, box, doc.file_name)`. The `UploadProgressModal` is already mounted and bound to `uploads`, so it'll pop back up automatically and animate from 50% → 100% during the render.

### 3. Modal visibility

`UploadProgressModal` opens whenever `uploads` has any entry not in `done`/`error` for >300ms. Re-setting an entry to `analyzing` will reopen it. Confirm in `OrderFiles.tsx` that the modal isn't gated on a separate "uploading" flag — if it is, switch it to derive open-state from `uploads` values.

### 4. Status text

Use distinct status messages so the user understands this is the post-confirmation render, not a re-upload:

- Bleed confirm: "Trimming to A5 and rendering pages…"
- Non-ISO scale: "Scaling to A4 and rendering pages…"
- Rotation: "Rotating to landscape and rendering pages…"
- Keep original: "Rendering pages…"

## Files to change

- `src/hooks/useDocumentUpload.ts` — add `renderWithProgress`; export it.
- `src/pages/dashboard/OrderFiles.tsx` — replace 4–5 advisory handler calls with `renderWithProgress`; ensure `UploadProgressModal` open-state reacts to `uploads`.

## Verification

1. Upload 160×222mm A5+bleed PDF → bleed advisory appears (no thumbnails yet, no progress modal).
2. Click "This is A5 with bleed" → dialog closes → **`UploadProgressModal` reopens** showing "Trimming to A5 and rendering pages…" with progress trickling 50 → 95 → 100%.
3. Modal closes when render completes; trimmed thumbnail appears.
4. Repeat for "Keep full size" (renders at MediaBox, progress shown).
5. Repeat for non-ISO scale and presentation rotation flows.
6. Network tab: still exactly one `crop-rasterize` per upload.

