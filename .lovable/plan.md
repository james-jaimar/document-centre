# Fast lightbox: thumbnail-first, PDF-upgrade-behind

## Problem

Clicking the eye icon on an uploaded file opens `PreviewLightbox`. Every page navigation shows a spinner because:

1. The lightbox always renders via `PdfPageView` (react-pdf) when `pdfSources` is present — the existing 150 DPI thumbnails are ignored.
2. On first open, the full PDF is downloaded into `pdfBlobCache` and parsed by pdf.js before anything paints.
3. Each page is rendered into a ~2.5× oversampled canvas (~2700px wide for A5), so the first paint of every page takes hundreds of ms — long enough to flash the `loading` spinner.

The inline configure-options preview feels instant only because by then the blob cache is warm and it shows 1–2 pages at a time. The lightbox is cold + 28 pages + per-page navigation.

## Fix

Render the already-generated thumbnail immediately, then fade in the crisp pdf.js render once it's ready. No spinner on page change.

### Changes

**`src/components/preview/PdfPageView.tsx`**
- Add optional `placeholderUrl?: string` prop.
- When set, render an `<img src={placeholderUrl}>` filling the slot underneath the `<Page>` canvas.
- Drop the centred spinner whenever a `placeholderUrl` is present (cold-load and per-page render).
- Use react-pdf's `onRenderSuccess` on `<Page>` to flag "rendered" and fade out the placeholder (~150ms opacity transition).

**`src/components/preview/LooseSheetsPreview.tsx`**
- In the `pdfSource` branch, pass `urls[currentPage]` as `placeholderUrl` to `PdfPageView` so the thumbnail shows instantly while pdf.js renders.

**`src/pages/dashboard/OrderFiles.tsx`**
- On the preview eye-icon `onClick` (line ~2439), kick off `getPdfBlob(lightboxPdfPath, signedUrl)` before opening the lightbox so the PDF download starts immediately (currently the fetch only starts after the dialog mounts and the signed URL effect resolves).
- Small helper: sign the URL up-front via `getDownloadUrls([lightboxPdfPath])` on click, then call `getPdfBlob` and set state. No behaviour change if it fails — the lightbox still falls back to its own signing path.

### Out of scope

- No backend changes.
- No changes to other preview surfaces (bound document, brochures, flip-book) — those already cache-warm via the configurator flow.
- No "HD/SD" toggle — the upgrade-in-background path already gives both.

### Expected result

- Lightbox opens to page 1 image instantly (thumbnail already in browser cache from the file card).
- Page navigation shows the next thumbnail immediately; pdf.js silently upgrades it within a few hundred ms.
- No visible spinner on any navigation for a 28-page A5 after the first open.
