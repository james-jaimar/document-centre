## Plan

1. **Stop the business-card lightbox using thumbnail rasters**
   - The enlarged preview on the files page is currently fed only `thumbnail_urls`, so when it is expanded it blows up a low-res PNG/JPEG instead of rendering the PDF.
   - I’ll pass the selected document’s processed PDF path into the lightbox, sign it, and provide per-page `pdfSources` to `PreviewLightbox`/`DocumentPreview`.

2. **Make the file-step lightbox honour TrimBox cropping too**
   - The main configurator preview already has a path for PDF rendering + trim clipping, but the files-page lightbox does not currently pass trim data.
   - I’ll derive `trimCrop` from `preflight_data.trim_box_pt` and the stored PDF dimensions, then pass it into the same preview renderer so crop marks/bleed are clipped consistently.

3. **Use a print-proof render scale for tiny products**
   - Keep the existing oversampled `PdfPageView`, but make it robust enough for the full-screen business-card proof: render from the actual PDF at a higher internal canvas resolution with a safe cap, then CSS-scale down.
   - This avoids changing the actual production output and only improves customer confidence in the on-screen proof.

4. **Validation**
   - Check the edited code paths for the files-page lightbox and shared PDF renderer.
   - I’ll avoid backend changes unless the frontend PDF render path reveals missing source-PDF data.