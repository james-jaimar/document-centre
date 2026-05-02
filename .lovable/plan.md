
## Problem

Two regressions in the PDF rendering path for static/loose product types (business cards, flyers, posters):

1. **Orientation not respected**: The canvas container always uses `canvasSizeMm` from the selected "Document Size" option, but for business cards the size option metadata may not include an `orientation` field, so the canvas defaults to portrait even when the PDF is landscape (90x50mm). The `pageAspectRatio` is correctly computed from the document dimensions, but when `canvasSizeMm` is present, it overrides the ratio entirely.

2. **Trim box / page effects lost**: When a `pdfSource` is available, `LooseSheetsPreview` returns early with a bare `PdfPageView` — completely bypassing `PageEffects`, which previously rendered the trim inset, paper shadow, border, and bleed effects on thumbnails.

## Fix

### 1. Canvas orientation awareness (LooseSheetsPreview.tsx)

When `canvasSizeMm` is provided but the PDF dimensions (`pdfSizeMm`) indicate a different orientation, swap the canvas dimensions to match the PDF orientation. This ensures a landscape business card (90x50mm) renders on a landscape canvas even if the size option stores dimensions as portrait-first (50x90mm).

Specifically: if `pdfSizeMm` indicates landscape (width > height) but `canvasSizeMm` indicates portrait (width < height), swap `canvasSizeMm.widthMm` and `canvasSizeMm.heightMm` for rendering purposes (and vice versa).

### 2. Restore PageEffects for PDF path (LooseSheetsPreview.tsx)

The PDF rendering branch currently skips `PageEffects`. Wrap the `PdfPageView` inside `PageEffects` the same way the thumbnail fallback does, so bleed/trim effects, paper shadow, and border styling are applied.

This means the PDF path will:
- Use `PageEffects` with the same `effects`, `bleedFlags`, and `bleedInsetPx` props
- Show the trim inset border when `allowBleed` is false
- Show edge-to-edge rendering when `allowBleed` is true (business cards)

### Files to edit

- `src/components/preview/LooseSheetsPreview.tsx` — Both fixes apply here:
  - Add orientation-aware canvas dimension swapping based on `pdfSizeMm`
  - Wrap `PdfPageView` in `PageEffects` to restore trim/bleed rendering
  - Pass through `effects`, `bleedFlags`, and page index props needed by PageEffects
- `src/components/preview/DocumentPreview.tsx` — Forward `effects` and `bleedFlags` to `LooseSheetsPreview` (if not already passed via `commonProps`)
