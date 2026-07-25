## Plan: restore high-res business card previews

### What I found
- The older working fix was not a better thumbnail; it rendered the original/processed PDF through `PdfPageView` and clipped to the PDF TrimBox in `LooseSheetsPreview`.
- The live order files lightbox already tries that PDF path, but only opens when thumbnail URLs exist and falls back to thumbnails while the signed PDF is still resolving.
- The placed-order snapshot path now stores `pdfSources`, but existing previews still depend on whether the saved snapshot has enough PDF/TrimBox metadata.

### Changes to make
1. **Make the file lightbox PDF-first for business cards**
   - In `OrderFiles.tsx`, allow the preview lightbox to open when a PDF source exists, even if thumbnails are missing or low-res.
   - Pass a real `productType="business_cards"` so it consistently uses the static high-res renderer path.

2. **Use the best available PDF source everywhere**
   - Prefer `preflight_data.processed_file_path` when present, otherwise use the original `file_path`.
   - Keep thumbnails only as instant placeholders/fallback, not as the primary renderer when a PDF source exists.

3. **Harden TrimBox clipping**
   - Re-check the TrimBox/MediaBox fraction math in `OrderFiles.tsx` and `LooseSheetsPreview.tsx` so crop-marked PDFs like the attached 89.99×55mm business card render the trimmed card area without double-cropping.
   - Keep the existing double-crop guard so files already cropped by the server are not cropped again.

4. **Backfill resilience for saved order previews**
   - In saved order/admin/customer preview paths, keep using snapshot `pdfSources` when available.
   - If a snapshot only has thumbnails but attached document rows still contain `processed_file_path`/`file_path`, use those as a fallback PDF source for the lightbox rather than locking the preview to low-res thumbnails.

5. **Verify with the attached PDF**
   - Use the attached `Talking Dog` business card PDF dimensions/boxes to confirm the expected TrimBox ratio.
   - Validate the rendered lightbox path points at `PdfPageView` and not only thumbnail `<img>` rendering.

### Files expected to change
- `src/pages/dashboard/OrderFiles.tsx`
- `src/components/orders/detail/JobDetailPanel.tsx`
- Possibly `src/components/preview/LooseSheetsPreview.tsx` if the TrimBox Y-offset needs correction after verification.