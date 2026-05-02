
# PDF-on-Canvas Preview: Show Document Scaling Within Selected Paper Size

## Problem

When a PDF's dimensions don't match the selected Document Size (e.g. a 203x254mm PDF on an A1 594x841mm canvas), the preview currently renders the PDF at the full preview area with no indication of how it fits on the paper. The user should see the white paper canvas at the correct aspect ratio, with the PDF content positioned within it — showing any gaps (white space) where the content doesn't fill the sheet.

## Approach

Replicate the fit/fill concept from `PosterImageEditor` but adapted for the inline preview (not a cropper dialog). The preview will show:

1. **The paper canvas** — a white rectangle at the selected Document Size aspect ratio
2. **The PDF content** — rendered inside using `react-pdf`, scaled to fit or fill the canvas
3. **Visible gaps** — white margins where content doesn't reach the paper edge (fit mode)

For static document types (posters, flyers, loose sheets), this replaces the current "raw PDF render" with a canvas-aware version.

## Changes

### 1. Pass selected canvas dimensions to PreviewPanel

**`src/pages/dashboard/OrderBuild.tsx`**
- Compute `canvasSizeMm` from the selected Document Size option's metadata (`width_mm`, `height_mm`), accounting for orientation.
- Pass `canvasSizeMm={{ widthMm, heightMm }}` as a new prop to `PreviewPanel`.

### 2. Forward canvas info through the preview pipeline

**`src/components/order/PreviewPanel.tsx`**
- Accept new `canvasSizeMm` prop.
- Compute `canvasAspectRatio` (width/height of the selected paper) separately from `pageAspectRatio` (the document's native ratio).
- Pass both to `LooseSheetsPreview`.

**`src/components/preview/previewTypes.ts`**
- Add `CanvasSize` interface (`widthMm`, `heightMm`).
- Add `canvasSizeMm` to `PreviewComponentProps`.

### 3. Render PDF content within a paper canvas

**`src/components/preview/LooseSheetsPreview.tsx`**
- When `canvasSizeMm` is provided and differs from the PDF's native size:
  - Draw the outer rectangle at the canvas (paper) aspect ratio — this is the white sheet.
  - Compute the PDF's native aspect from `page_width_mm` / `page_height_mm`.
  - Scale the PDF to **fit** within the canvas (maintaining PDF aspect ratio), centering it.
  - The `PdfPageView` renders inside, smaller than the canvas, showing white margins.
- When sizes match (or no canvas info), render as currently (PDF fills the preview area).

### 4. Future: Fit/Fill toggle (deferred)

The user mentioned giving clients the option to choose fit vs fill. This plan implements **fit** as the default (showing the gaps). A follow-up can add a small toggle control and the crop/fill logic from `PosterImageEditor`.

## Technical Detail

Canvas aspect vs PDF aspect calculation:
```text
canvasAspect = canvasWidthMm / canvasHeightMm  (e.g. 594/841 = 0.707 for A1 portrait)
pdfAspect    = pdfWidthMm / pdfHeightMm        (e.g. 203/254 = 0.799 for the uploaded doc)

If pdfAspect > canvasAspect → PDF is wider relative to height → fit to width, gap top/bottom
If pdfAspect < canvasAspect → PDF is taller relative to width → fit to height, gap left/right
```

The PDF content is rendered via `PdfPageView` at the computed inner dimensions, centered within the paper rectangle.
