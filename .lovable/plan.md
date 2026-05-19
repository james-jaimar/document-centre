## Diagnosis

The current output screenshot still says **PDF Producer: GPL Ghostscript 10.02.1** and Acrobat Output Preview still samples **Process Black 98%**. That strongly suggests the mutool-first path is either not being used, failing verifier, or the verifier is incorrectly accepting a Ghostscript candidate that still appears as 98% in Acrobat.

I found two likely causes in the current implementation:

1. **`mutool convert -O colorspace=gray` is probably not doing what we assumed for PDF output.** In MuPDF docs, `colorspace=gray` is documented under raster-output options, while PDF output options are mainly compression/cleanup options. So for vector PDF output, this may be ignored or may not guarantee Acrobat-visible 100% K.
2. **The verifier is not matching the customer-facing Acrobat result.** It rasterises through Ghostscript `tiff32nc`, and Ghostscript can treat DeviceGray specially as K internally. That can report acceptable K even when Acrobat’s SWOP Output Preview still displays 98% because of a gray tone/profile interpretation.

## Plan

### 1. Replace the primary greyscale strategy with a true K-only CMYK PDF path

In `pdf-server/app/services/pdf_ops.py`, change the first strategy from “PDF-to-PDF mutool gray” to a CMYK-focused path designed for Acrobat separations:

- Generate a grayscale intermediate only as needed.
- Convert the result to **DeviceCMYK** using Ghostscript with settings that keep DeviceGray mapped to the K channel.
- Avoid outputting final DeviceGray for B&W print-ready PDFs, because Acrobat’s SWOP simulation can show DeviceGray black as 98%.
- The final B&W production PDF should sample as:
  - Cyan 0%
  - Magenta 0%
  - Yellow 0%
  - Black 100%

### 2. Add a stricter Acrobat-style verifier

Update `verify_pure_black_text()` so the acceptance gate is based on the final PDF’s separation behaviour, not just a Ghostscript raster shortcut that can mask the 98% issue.

The verifier will:

- Render page 1 through a CMYK separation path that better matches the final production intent.
- Treat 98% K as failure for “pure black text” when CMY is 0 but K is under the acceptance target.
- Keep reporting `min_k_pct`, `max_cmy_pct`, `near_black_pixels`, and `pure_k_ok`, but tighten the gate to catch the exact failure shown in the screenshot.

### 3. Keep mutool, but demote it to normalisation/support only

Keep `mutool` in diagnostics and available for cleanup/fallback, but don’t rely on `mutool convert -O colorspace=gray` as proof of final print separations unless the stricter verifier passes.

### 4. Improve reporting so we can see why it failed next time

In `assembly_report.colour_check`, include:

- selected `strategy`
- each attempted command family
- verifier metrics per attempt
- whether the final file is `DeviceCMYK`-targeted or `DeviceGray`-targeted
- any stderr snippets when a strategy fails

### 5. Bump cache version again

In `pdf-server/app/tasks/production_tasks.py`, bump `colour_pipeline_version` from `3` to `4` so existing INV-00057-3 artefacts are forced to regenerate.

## Verification after deploy

1. Git pull on the VPS and restart API + workers.
2. Force regenerate/re-assemble INV-00057-3.
3. Check the new `assembly_report.colour_check`:
   - expected `strategy`: `cmyk_k_only` or equivalent
   - expected `min_k_pct`: 100
   - expected `max_cmy_pct`: 0
4. Download the new print-ready PDF and check Acrobat Output Preview with U.S. Web Coated SWOP v2:
   - Process Cyan: 0%
   - Process Magenta: 0%
   - Process Yellow: 0%
   - Process Black: 100%

## Files to update

- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/tasks/production_tasks.py`
- `.lovable/plan.md`