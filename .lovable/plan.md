# Plan: fix the remaining cropped landscape pages

The screenshot shows the landscape content is now being rotated, but the preview render is still using a portrait-sized box somewhere after the resize/orientation work. The likely remaining workflow bugs are:

1. `resize_pdf` creates a resized PDF but does not promote it to `asset.normalized_storage_path`, so later orientation/preview steps may still use the pre-resize LibreOffice output.
2. The frontend’s `getMediaBox()` reads only the asset’s top-level `boxes.MediaBox`, which is page-1 metadata only. In a mixed-orientation file, page 1 can be portrait, so the render/crop box passed to `generate-previews` can still be portrait even after the backend has handled individual landscape pages.
3. `normalize_orientation()` currently rewrites geometry using rotation hints rather than baking page content into a stable portrait canvas, leaving room for Ghostscript/crop rendering to apply a mismatched box.

## Implementation

### 1. Promote resized PDFs as the new canonical asset
Update `pdf-server/app/tasks/operation_tasks.py` in `resize_pdf`:
- After `pdf_ops.resize_pages(...)`, upload the resized PDF.
- Re-run `pdf_ops.inspect(out_pdf)`.
- Update the asset with:
  - `normalized_storage_path`
  - `page_count`
  - `width_pt`
  - `height_pt`
  - `boxes`
- Return those fields in the resize job result.

This ensures the subsequent `normalize-orientation`, `print-ready`, and `generate-previews` steps all operate on the resized A4 PDF, not the original converted PDF.

### 2. Stop passing a page-1-only render box after scale/keep/rotate
Update `src/pages/dashboard/OrderFiles.tsx` and `src/hooks/useDocumentUpload.ts` so preview rendering can be called without an explicit crop/render box when we want the whole current PDF:
- Allow `renderDocumentThumbnails(..., box?)` and `renderWithProgress(..., box?)`.
- When no box is passed, call `generatePreviews(assetId)` without `render_box`.
- For "Scale to A4", "Keep original", and rotate-to-landscape flows, render without a crop box after the final backend PDF has been promoted.
- Keep explicit boxes only for real trimming/bleed cases where the user intentionally chooses a trim box.

This avoids a portrait page-1 MediaBox being applied as a global crop box across all pages.

### 3. Make orientation normalization fully bake geometry instead of relying on `/Rotate`
Update `pdf-server/app/services/pdf_ops.py`:
- Replace the current `normalize_orientation` rotation-hint rewrite with a safer pypdf blank-page composition approach:
  - `transfer_rotation_to_content()` first for every page.
  - If a page needs rotating, place it onto a new blank page whose width/height are swapped.
  - Apply a content transform that rotates/translates the page content into that new canvas.
  - If a page does not need rotating, add it as-is after rotation has been baked.
- This outputs pages with stable MediaBoxes and no stale `/Rotate` hints.

This should eliminate the remaining "content is visually landscape, but canvas/crop is portrait" failure mode.

### 4. Clean generated Python cache from the previous edit
Remove `pdf-server/app/services/__pycache__/pdf_ops.cpython-313.pyc` from the repo changes so no binary cache file is committed.

### 5. Update memory
Update `mem://infrastructure/pdf-box-rendering` with two additional rules:
- Operation outputs that are intended to affect preview/production must promote `asset.normalized_storage_path` before later steps run.
- Do not pass a single page-1 crop box as a global preview render box for mixed-orientation documents; use no render box for full-document rendering, and explicit boxes only for intentional trim/bleed.

## Verification

After implementation, verify the workflow against the provided Word/PDF case:
- Upload/convert the Word document.
- Choose Scale to A4.
- Confirm resize job promotes the resized output.
- Confirm orientation normalization runs after resize.
- Confirm preview generation is called without a global portrait render box.
- Confirm the landscape table page is not cropped after rotation.

Deployment to the VPS will still require restarting the document centre worker/API after pulling the patch.