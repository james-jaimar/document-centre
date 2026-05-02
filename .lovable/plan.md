
## Problem

Static document previews (loose sheets, posters, flyers, business cards) currently display rasterized thumbnail images that are noticeably low-resolution, especially for small formats like business cards. Since every uploaded file is already converted to PDF, we can render the actual PDF directly in the browser at full resolution.

## Approach

Use **`react-pdf`** (a React wrapper around Mozilla's pdf.js) to render individual PDF pages as high-resolution canvas elements. This replaces the `<img>` tag in `LooseSheetsPreview` with a `<Document>/<Page>` component that renders the PDF at the container's native pixel resolution — vector content stays pin-sharp at any zoom.

### What changes

1. **Install `react-pdf`** — lightweight React wrapper for pdf.js with canvas rendering.

2. **New component: `PdfPageView`** — a small wrapper that takes a signed PDF URL and a page number, renders that page via react-pdf's `<Page>` component at the container's pixel dimensions. No toolbar, no controls, just the rendered page. Handles loading/error states gracefully.

3. **Update `LooseSheetsPreview`** — when a signed PDF URL is available for the current document, render `PdfPageView` instead of an `<img>`. Falls back to the existing thumbnail `<img>` if no PDF URL is provided (backward compatible).

4. **Update `PreviewPanel`** — pass each document's `file_path` (the S3 PDF key) alongside the existing thumbnail data so `DocumentPreview` can forward it to `LooseSheetsPreview`. Sign the PDF URL using the existing `getDownloadUrls` utility.

5. **Update `DocumentPreview`** — accept an optional `pdfUrl` prop and forward it to `LooseSheetsPreview` (only for non-bound, non-fold types).

### What does NOT change

- **FlipBook / bound documents** — still use thumbnail images (they need pre-rasterized images for the page-flip animation).
- **FoldPreview / brochures** — still use CSS-based panel slicing of thumbnail images.
- **RingBinderPreview** — still uses thumbnails.
- **PageEffects** — still wraps the content (bleed, lamination effects still apply).
- **Grayscale filter for B&W** — still applied via CSS on the canvas container.

### Scope of product types affected

| Product type | Current | After |
|---|---|---|
| Loose sheets / stapled | Thumbnail image | PDF page render |
| Poster | Thumbnail image | PDF page render |
| Flyer | Thumbnail image | PDF page render |
| Business cards | Thumbnail image | PDF page render |
| Bound documents | Thumbnail image | No change |
| Folded leaflets | CSS panel slice | No change |
| Ring binder | Thumbnail image | No change |
| Photo prints | Photo image | No change |

### Technical details

- `react-pdf` renders to a `<canvas>` element at configurable pixel width/height. We set it to match the container dimensions multiplied by `devicePixelRatio` for retina sharpness.
- The PDF URL is signed once per document using the existing `getDownloadUrls` from `s3Storage.ts`.
- pdf.js worker is loaded from CDN (standard react-pdf setup) to avoid bundling issues.
- The `<Page>` component is set to `renderTextLayer={false}` and `renderAnnotationLayer={false}` — pure visual render only.

### Files to create/modify

- **New**: `src/components/preview/PdfPageView.tsx`
- **Edit**: `src/components/preview/LooseSheetsPreview.tsx`
- **Edit**: `src/components/preview/DocumentPreview.tsx`
- **Edit**: `src/components/preview/previewTypes.ts`
- **Edit**: `src/components/order/PreviewPanel.tsx`
- **Install**: `react-pdf` package
