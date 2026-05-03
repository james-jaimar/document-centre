I found why this still looks broken: the backend is recording that orientation normalization ran and rotated 20/24 pages, but the final preview row still does not persist the processed PDF path, and the current resize/finalise path can rely on stale document preflight state. We should stop trying to patch this from the preview side and make the PDF pipeline itself guarantee the final asset is portrait for `stapled-loose-pages`.

Plan:

1. Fix the upload/advisory finalisation path
   - In `src/pages/dashboard/OrderFiles.tsx`, after scaling to A4, always run the orientation finalisation for required-orientation products instead of skipping it because an old `preflight.print_ready_done` flag says print-ready already happened.
   - Clear/stamp the relevant preflight fields after resize so the UI no longer carries stale dimensions/paths from before orientation normalization.
   - Persist `processed_file_path` from the authoritative backend asset after `resize -> normalize-orientation -> print-ready`, so the inline PDF preview and thumbnails are both reading the same processed PDF.

2. Fix the shared render helper so every deferred render stores the processed path
   - In `renderDocumentThumbnails`, re-fetch the asset after the preview job completes and write `preflight_data.processed_file_path = asset.normalized_storage_path`.
   - Preserve existing preflight flags while adding `orientation_normalized`, `processed_file_path`, and current `boxes/width_pt/height_pt` from the processed asset.
   - This covers normal upload, size advisory, orientation advisory, bleed advisory, and reprocess flows.

3. Make backend orientation normalization more literal and reliable
   - In `pdf-server/app/services/pdf_ops.py`, adjust `normalize_orientation` to use a simple per-page rule for portrait-required products: if the visual page is landscape, rotate that page 90° clockwise onto a portrait MediaBox.
   - Keep `/Rotate` baked into content first, then write pages with no residual `/Rotate` hint so Ghostscript, pdf.js, and thumbnail rasterization cannot disagree.
   - Keep the existing box stamping where possible, but prioritise the correct final page canvas/orientation over preserving stale per-page boxes.

4. Add a backend safety net after print-ready conversion
   - Ghostscript/pdfwrite may rewrite page geometry. After `print_ready`, inspect page metadata; if a product has already been orientation-normalized and any page is still landscape for a portrait-required asset, run one final normalize pass before marking the asset ready.
   - Record this in asset/document metadata so we can see `pages_rotated`, `orientation_normalized`, and the final storage path in ops.

5. Add a small regression check
   - Add a test/script-level check for a mixed-orientation PDF: portrait pages stay portrait; landscape pages become portrait; page count stays the same; output has no `/Rotate 90/270` pages.
   - This protects the working bound-document behaviour while applying the same rule to stapled/loose pages.

Expected result:
- Word/PDF mixed portrait+landscape uploads for `stapled-loose-pages` end as a 24-page portrait PDF.
- Landscape pages are rotated 90° clockwise as real PDF pages, not just viewer hints.
- The preview uses the processed backend PDF, not the original upload.
- Re-uploading the sample should show page 6 as a portrait sheet with the former landscape content rotated, matching the bound-document behaviour.