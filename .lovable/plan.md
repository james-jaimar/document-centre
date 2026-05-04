
## Problem

Business cards currently fall back to low-res pre-rendered thumbnails because the previous fix (to avoid showing crop marks from the MediaBox) excluded them from inline PDF rendering. The result is a blurry preview.

## Solution

Re-enable inline PDF rendering for business cards, but add TrimBox-aware cropping so crop marks are hidden.

### How it works

1. **Re-include business cards in `isStaticType`** (`PreviewPanel.tsx` line 515) — remove `!isBusinessCard` so they get full-resolution inline PDF via `PdfPageView`.

2. **Pass TrimBox crop data to `LooseSheetsPreview`** — compute a `trimCrop` object from `preflight_data.trim_box_pt` and the MediaBox dimensions. This tells the renderer how much to over-scale and offset the PDF page to show only the finished trim area.

3. **Apply CSS cropping in `LooseSheetsPreview`** — when `trimCrop` is present, render `PdfPageView` at the larger MediaBox-proportional size and use a CSS `overflow: hidden` container with negative margins/transform to clip to TrimBox bounds.

### Files to change

- **`src/components/order/PreviewPanel.tsx`**
  - Remove `isBusinessCard` exclusion from `isStaticType` (line 515)
  - Compute `trimCrop` ratio from preflight `trim_box_pt` vs `page_width_mm`/`page_height_mm` (MediaBox)
  - Pass `trimCrop` to the preview component

- **`src/components/preview/LooseSheetsPreview.tsx`**
  - Accept optional `trimCrop` prop (top/left/width/height as fractions of MediaBox)
  - When present, scale `PdfPageView` to MediaBox proportions and clip to TrimBox region via CSS

- **`src/components/preview/previewTypes.ts`**
  - Add `trimCrop` to `PreviewComponentProps` interface

No backend changes required — all trim data is already available from preflight.
