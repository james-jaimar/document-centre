## Context

The previous fix (May 2026) made business card previews sharp by:
- Oversampling PDF renders in `src/components/preview/PdfPageView.tsx` (2.5× render, CSS-scaled down, `MAX_RENDER_PX = 3600`).
- Feeding the actual processed PDF (not the thumbnail) into the files-page lightbox in `src/pages/dashboard/OrderFiles.tsx`.

Business card previews are now soft again in every surface (configurator, files lightbox, cart, admin order/quote detail). Before changing anything I need to confirm which specific link in that chain regressed rather than guess.

## Plan

### 1. Reproduce and diagnose (read-only)

- Load a business card order in the running preview, then inspect the DOM for the preview slot:
  - Is a `<canvas>` from `react-pdf` present (the crisp path)?
  - Or is only an `<img>` from a thumbnail visible (placeholder path — indicates `pdfSources`/signed URL missing)?
- If the canvas is present, read its `width`/`height` attributes and the on-screen CSS size to compute the effective device-px per mm and confirm whether oversampling is still active or has been clamped to 1×.
- Check the console/network for failed signed-URL fetches or `getPdfBlob` errors for the business-card PDF.
- Confirm which of these code paths is actually driving each surface:
  - Configurator → `src/components/order/PreviewPanel.tsx` → `DocumentPreview` → `LooseSheetsPreview`.
  - Files lightbox → `src/pages/dashboard/OrderFiles.tsx` → `PreviewLightbox`.
  - Cart / Order Confirmation → whichever preview component `Cart.tsx` / `OrderConfirmation.tsx` uses today.
  - Admin (branch/tenant) order & quote detail → same shared preview components.

### 2. Fix the confirmed regression(s)

Depending on what the diagnostic step shows, apply the narrowest fix that restores sharpness in all four surfaces:

- **If the placeholder image is being shown instead of the PDF** (no `<canvas>`): repair the `pdfSources` pipeline for business cards in the affected surface — make sure the processed PDF path is resolved, signed via `getDownloadUrls`, and passed into `DocumentPreview` / `PreviewLightbox`. Cart and admin previews should reuse the same helper the files lightbox already uses.
- **If the canvas is present but effectively low DPI** (oversample clamped): tighten `PdfPageView.tsx` so business-card-sized renders always oversample to a print-proof density. Options include raising `MAX_RENDER_PX` further, or computing render width from the underlying trim size in mm at a target DPI (e.g. ≥300 DPI for pieces smaller than A5) instead of from CSS pixels alone. Cap memory with an absolute pixel ceiling.
- **If `useTrimClip` in `LooseSheetsPreview.tsx` is inflating the render past the oversample cap**, apply the oversample using the *visible* trim size, not the inflated MediaBox render, so business cards don’t lose effective resolution when TrimBox clipping is active.

Do not touch pricing, product config, layout, or backend PDF services — this is a preview-rendering fix only.

### 3. Verify in every surface

- Configurator preview (`/dashboard/order/build`).
- Files-step lightbox (`/dashboard/order/files`).
- Cart and Order Confirmation previews.
- Admin order/quote detail previews at branch and tenant levels.

For each surface: open a business card order, confirm the DOM shows a `<canvas>` at oversampled resolution and the visual result is crisp when zoomed. Note the effective device-px per mm to prove the oversample is active.

### 4. Deliverables

- Minimal edits to `src/components/preview/PdfPageView.tsx` and/or the specific surface(s) whose `pdfSources` pipeline is broken.
- A short written note in the reply summarising which link had regressed and what changed, with the measured effective preview DPI before vs after.

## Out of scope

- Pricing, variant, VAT, or catalogue logic.
- Backend PDF service (Cloud Run / pdf-server) changes.
- Any layout, styling, or product-behaviour changes outside the preview render pipeline.
- Fixing the unrelated Vite import overlay error (`@ /components/ui/sonner`) that appeared in the session replay — I can address it in a separate task if you want.
