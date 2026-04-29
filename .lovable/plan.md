The current failure is now more specific: the ICC files verify as present, but Ghostscript still exits 255 during `print-ready`, and even with improved capture the job reports `stderr: (empty)`. That points away from “missing ICC file” and toward an incompatible/fragile Ghostscript command or environment. Also, the browser “Tracking Prevention blocked access to storage” messages are unrelated CDN/emoji warnings; the real failure is the `POST v1/operations/print-ready` job.

Plan:

1. Make print-ready safe-by-default instead of blocking uploads
   - Change the frontend upload flow so `print-ready` remains non-fatal and does not pretend it succeeded when it failed.
   - If `print-ready` fails, continue directly to `generate-previews` using the normalized/original PDF, but persist a `print_ready_error` marker instead of `print_ready_done: true`.
   - This keeps customer uploads usable while the CMYK pass is being fixed.

2. Replace the Ghostscript print-ready command with a staged fallback ladder
   - In `pdf-server/app/services/pdf_ops.py`, keep the high-quality ICC conversion as attempt 1, but remove flags most likely to trip old/packaged Ghostscript builds:
     - first remove `-dKPreserve=2`, `-dBlackPtComp=true`, and `-dPreserveOverprintSettings=true` from the baseline attempt;
     - keep only the core conversion flags: `pdfwrite`, `ColorConversionStrategy=CMYK`, `ProcessColorModel=/DeviceCMYK`, `DefaultRGBProfile`, `DefaultCMYKProfile`, output file, input file.
   - Add fallback attempts if Ghostscript returns non-zero:
     1. core ICC conversion with explicit source/destination profiles;
     2. core conversion using Ghostscript’s built-in RGB/CMYK defaults, no external profiles;
     3. plain `pdfwrite` normalize-only as a last resort, clearly flagged as not ICC-converted.
   - Only promote the output as `print_ready_pdf` if conversion succeeds or a configured fallback allows it; otherwise return a structured failure that the frontend can handle without breaking preview generation.

3. Capture useful diagnostics even when stderr is empty
   - Add a small command runner helper that records:
     - return code;
     - exact command;
     - stdout tail;
     - stderr tail;
     - whether output PDF exists and its byte size;
     - selected attempt name.
   - In the failure message, include stdout as well as stderr. Ghostscript often writes errors to stdout or exits after producing only `GPL Ghostscript ... Unrecoverable error`.
   - Add `--permit-file-read` paths for the input workspace and `/opt/document-centre-api/icc` when using `-dSAFER`, because newer Ghostscript file-access controls can block profile/input reads unexpectedly.

4. Stop using the compact 480-byte sRGB fallback as the preferred production source profile
   - The current installer prefers `saucecontrol/Compact-ICC-Profiles` first. That profile validates as an ICC (`acsp`) but is a tiny embedded-profile variant, not ideal as Ghostscript’s production default RGB profile.
   - Update `install-icc-profiles.sh` to prefer the official ICC `sRGB_v4_ICC_preference.icc` when already present, and otherwise download a fuller standard profile from reliable mirrors before falling back to compact ICC.
   - Enhance validation to print file size and profile source. This helps spot “valid but suspiciously tiny” profiles.

5. Add a VPS smoke-test script for print-ready conversion
   - Add `pdf-server/scripts/smoke-test-print-ready.sh` that accepts an input PDF and runs the same fallback ladder locally on the server.
   - It should print which Ghostscript attempt succeeded/failed and where the output landed, without requiring the web app or Celery.
   - This gives a fast answer on the VPS before re-testing through the upload UI.

6. Improve 8-page preview speed separately from print-ready
   - Your Windows “save PDF to JPG in 3 seconds” comparison is about rasterization, not CMYK print-ready conversion.
   - The current `generate_previews` path still renders page 1 first, then dispatches pages 2-8 as one Celery task per page. That helps once all workers are ready, but it still pays per-page Ghostscript startup cost.
   - Add a faster batch-render path for small/medium PDFs:
     - run one Ghostscript process to render all preview pages in one pass;
     - downscale thumbnails in parallel with Pillow;
     - upload/record pages concurrently;
     - keep the current per-page fan-out as a fallback for failures or very large files.
   - This should get 8-page PDFs much closer to desktop-style timing, because Ghostscript starts once instead of 8 times.

7. Deployment/check steps after implementation
   - Rsync updated `pdf-server/` to `/opt/document-centre-api/` excluding `.venv`, `.env`, storage, tmp, pycache, and git.
   - Re-run the ICC installer and smoke-test script.
   - Restart:
     - `document-centre-api`
     - `document-centre-worker-heavy`
     - `document-centre-worker-light`
   - Re-upload the same 8-page PDF and compare:
     - print-ready job result/fallback diagnostics;
     - total preview render time;
     - derived files present for all 8 pages.

Expected result:
- Uploads should no longer be derailed by a print-ready Ghostscript 255 failure.
- If CMYK conversion still fails on the VPS Ghostscript build, we will see which exact command attempt failed and why.
- Preview generation for an 8-page PDF should become substantially faster by avoiding per-page Ghostscript startup overhead.