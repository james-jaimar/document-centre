# Honor document orientation in the upload-step preview lightbox

## Problem

On the **Upload & Organise Files** step (e.g. Business Cards), clicking the small thumbnail to open the full-screen preview shows the page rendered inside a hard-coded **A4 portrait** white window. A landscape document (business card, landscape flyer, etc.) sits awkwardly inside that portrait frame.

The small middle-column thumbnail is already correct — it uses the real document dimensions.

## Root cause

`src/pages/dashboard/OrderFiles.tsx` opens `PreviewLightbox` passing only `thumbnailPaths`:

```tsx
<PreviewLightbox
  thumbnailPaths={lightboxThumbnails}
  onClose={() => setLightboxOpen(false)}
/>
```

With no `pageAspectRatio`, `pdfSizeMm`, or `canvasSizeMm`, `LooseSheetsPreview` falls back to `ratio = 0.707` (A4 portrait) and renders the white sheet in portrait regardless of the actual file.

Everywhere else (`PreviewPanel`, `JobDetailPanel`, `CustomerOrderDetail`) already passes these props — only this upload-step entry point is missing them.

## Fix

Compute and pass the real document shape from `previewDoc` (which already exposes `page_width_mm` / `page_height_mm`) into the lightbox.

### Changes — `src/pages/dashboard/OrderFiles.tsx` only

1. Near `lightboxThumbnails` (≈ line 1135), derive:
   - `lightboxPdfSizeMm`: `{ widthMm: previewDoc.page_width_mm, heightMm: previewDoc.page_height_mm }` when both are positive numbers, else `undefined`.
   - `lightboxAspect`: `widthMm / heightMm` when available, else `undefined`.

2. Update the lightbox render (≈ line 2256) to pass those through:

```tsx
<PreviewLightbox
  thumbnailPaths={lightboxThumbnails}
  pageAspectRatio={lightboxAspect}
  pdfSizeMm={lightboxPdfSizeMm}
  canvasSizeMm={lightboxPdfSizeMm}
  onClose={() => setLightboxOpen(false)}
/>
```

Using `pdfSizeMm` as the `canvasSizeMm` makes the white sheet match the document exactly — which is the right behaviour at the upload step (no separate "selected paper size" is in play yet, unlike the configure step where `PreviewPanel` already supplies a real `canvasSizeMm`).

`PreviewLightbox` already spreads extra props into `DocumentPreview`, and `LooseSheetsPreview` already handles `pdfSizeMm` / `canvasSizeMm` / `pageAspectRatio` correctly, so no changes are needed in the preview components themselves.

## Verification

1. Business Cards: upload a 90×50 mm landscape PDF → click middle thumbnail → lightbox white sheet renders in landscape, matching the document.
2. A4 portrait document (e.g. flyer): lightbox renders portrait as before — no regression.
3. A4 landscape flyer / landscape poster: lightbox renders landscape.
4. Multi-page document: navigation arrows still work; aspect stays correct across pages.

## Out of scope

- `JobDetailPanel` and `CustomerOrderDetail` lightboxes (already pass the right props; user reported only the upload step).
- Any change to `LooseSheetsPreview` / `PreviewLightbox` internals.
- Configure-step preview behaviour (already correct).
