I found the problem, and you’re right: this should be a simple “landscape page → rotate 90° clockwise → save that PDF → show that saved PDF” flow.

What’s actually happening in the latest failed upload is:

- The backend did detect the mixed-orientation PDF.
- It did run `normalize_orientation` and reported `pages_rotated: 20`.
- Then the A4 scaling step ran afterwards.
- During/after scaling + print-ready, the generated page previews for page 8 are still landscape-sized (`1520×1075`), while page 1 is portrait-sized (`1075×1520`).

So the rotation pass is being undone/neutralised by the later resize/print-ready/preview path. The key issue is not “no rotation job is called”; it is that the pipeline is still allowing a later stage to preserve/recreate per-page landscape canvases for loose/stapled pages.

Plan to fix it directly:

1. Backend: make orientation normalisation a hard geometry operation
   - Update `pdf-server/app/services/pdf_ops.py` so `normalize_orientation` literally writes every mismatched page into a new portrait/landscape MediaBox with no remaining `/Rotate` ambiguity.
   - Use the PDF coordinate transform for clockwise page rotation explicitly and keep page boxes consistent.
   - Ensure the output page dimensions after normalisation are actually portrait for `dominant='portrait'`.

2. Backend: stop resize from reintroducing landscape pages for portrait-required products
   - Add an optional orientation target to the resize operation, e.g. `dominant_orientation`.
   - When called with `portrait`, resize every page to portrait A4, not “same orientation as source page”.
   - For loose sheets/stapled pages, this means a landscape page that was rotated should stay on a portrait canvas after scaling.

3. Frontend: call resize with the product’s required orientation
   - In `src/pages/dashboard/OrderFiles.tsx`, when scaling to A4 for `stapled-loose-pages` and other portrait-required products, pass the required orientation into the resize call.
   - This removes the current loophole where resize uses the originally detected landscape dimensions to pick landscape A4 for those pages.

4. Backend: protect print-ready from changing orientation
   - Add `-dAutoRotatePages=/None` to Ghostscript `pdfwrite`/CMYK conversion commands in `pdf_ops.py` so CMYK conversion does not auto-rotate pages based on text flow.
   - After print-ready, run a final cheap orientation assertion/normalisation for portrait-required assets if needed.

5. Frontend: persist and render only the final saved PDF
   - Keep `processed_file_path` pointing at the final `normalized_storage_path` after print-ready.
   - Clear PDF blob/signed URL cache for that final processed file so the preview cannot show the previous unrotated PDF.
   - Ensure loose/stapled preview uses the processed PDF and fresh thumbnails.

6. Verification
   - Use the existing recent failed asset/job data as the test case.
   - Confirm the operation sequence ends with all page previews portrait-sized for stapled loose pages.
   - Confirm `documents.preflight_data.processed_file_path` points to the final print-ready/normalised PDF, not the original upload.

This is not a rewrite; it’s tightening the existing pipeline so once a page is rotated for a portrait-required product, no later resize or CMYK stage is allowed to bring landscape pages back.