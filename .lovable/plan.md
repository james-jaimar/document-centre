## Plan: fix PDF resize for bleed and crop marks

### Goal
Ensure PDFs with bleed, crop marks, and a real TrimBox resize correctly to the selected product size instead of scaling the full MediaBox/crop-mark canvas.

### Current diagnosis
The previous `respect_trim_box` logic is likely correct at the resize step, but it is being defeated earlier in the server pipeline:

```text
uploaded PDF
  -> CMYK conversion
  -> orientation normalization
  -> resize_pages
  -> print-ready output
```

The CMYK conversion uses Ghostscript `pdfwrite`, which commonly drops `/TrimBox`, `/BleedBox`, and `/ArtBox`, keeping only MediaBox/CropBox. By the time `resize_pages` runs, the document no longer has a reliable real TrimBox, so the resize logic falls back to scaling the whole MediaBox, including bleed/crop marks.

### Implementation steps
1. **Reorder the transformation pipeline**
   - Change the print-ready preparation flow so page resizing happens before CMYK conversion:

   ```text
   uploaded PDF
     -> resize_pages while TrimBox/BleedBox are still intact
     -> orientation normalization if still needed
     -> CMYK conversion
     -> print-ready output
   ```

2. **Avoid double orientation handling**
   - If `resize_pages` already receives `dominant_orientation`, skip or narrow the separate orientation normalization step so pages are not rotated twice.

3. **Preserve final page boxes after CMYK**
   - After Ghostscript CMYK conversion, re-apply the intended page boxes from the pre-CMYK resized PDF where needed:
     - MediaBox
     - CropBox
     - TrimBox
     - BleedBox
     - ArtBox
   - This keeps the final output structurally correct even after Ghostscript rewrites the PDF.

4. **Add a focused regression check**
   - Use a sample bleed/crop PDF if available.
   - Verify before/after page boxes and final dimensions with PDF inspection tooling.
   - Confirm that a file with real TrimBox is resized based on trim content, not crop-mark canvas.

### Files likely affected
- VPS/PDF API transformation code for print-ready preparation.
- The CMYK conversion helper only if we need a small post-processing wrapper to restore page boxes.
- No frontend changes expected.
- No database/schema changes expected.
- No order-flow changes expected.

### Validation
I will verify the fix by checking the PDF box geometry before and after each transformation stage, specifically confirming that:

```text
TrimBox survives until resize_pages
resize_pages uses TrimBox for fitting
final output has the expected product MediaBox/CropBox/TrimBox
crop marks/bleed no longer distort the resized page
```

### Requested input
If you can upload or provide the exact failing PDF, I can reproduce against that file directly. If not, I will still implement the pipeline fix and validate with a synthetic bleed/crop PDF that has distinct MediaBox, CropBox, BleedBox, and TrimBox values.