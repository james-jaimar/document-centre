# Fix A5 → A4 scaling losing bleed and crop marks (INV-01002-1)

## What I've confirmed so far
- The print-ready file for INV-01002-1 was **not** resized at assembly. Assembly reused a file the "Scale to A4" button had already made at upload time (`derived/resized/...`). It saw 210×297 mm and skipped its own bleed-aware resize.
- So the problem sits in the upload-time scale step, not in assembly or imposition.
- That step only keeps the trim and bleed when the app sends a "respect trim box" flag. The app sends it only if the uploaded file's details show bleed/trim. If they don't, the server scales the whole page, crop marks included, up to A4.
- The upload-time scale also never asks for a fresh fixed 3 mm bleed. Assembly-time resize does ask for one.
- Before resizing, the server first runs a colour (CMYK) conversion. That step may drop the file's trim/bleed information, so the resize could no longer see it. **Not confirmed yet.**

## Step 1: confirm the cause on the real file
- Download the customer's original A5 upload and the A4 file that was made from it.
- Read the trim, bleed and page sizes of each, and check what the original preflight recorded.
- Then pick the cause that matches: (a) the flag wasn't sent, (b) the colour step dropped the trim info, or (c) the resize itself is wrong.

## Step 2: fix (adjusted to whatever Step 1 shows)
- **App:** when scaling, always send "respect trim box" if the file has a trim area smaller than the page, and ask for a 3 mm bleed (same as assembly does).
- **PDF server, upload-time scale:**
  - Read trim/bleed from the original upload *before* the colour step.
  - After the colour step, put those settings back if they were lost.
  - Pass the 3 mm bleed through to the resize, so the output is A4 trim (210×297) plus a 3 mm bleed (216×303). The old crop marks fall outside the page.
- **Assembly safety net:** if a reused file still has crop marks in the printed area, or has no bleed even though the original upload had some, don't reuse it. Re-run the bleed-aware resize from the original upload instead.
- **Imposition:** check that new crop marks are drawn around the 210×297 trim.

## Step 3: test and re-run
- Add a server test: an A5 file with 3 mm bleed and crop marks, scaled to A4, should come out at 210×297 trim and 216×303 page, with the crop marks removed.
- After the PDF server redeploys, re-scale INV-01002-1 from the original upload, then re-assemble and re-impose. Check the result visually.

## Also: booklet imposition opens with an Acrobat page error (INV-01003-1)
- The "Booklet A4 → SRA3 Bleed & Crops" imposition finished and saved at 05:21. Acrobat reports a broken page when opening it.
- Download that imposed file and check it with qpdf to find the broken page object. The booklet imposition function is the likely source; the regular 2-up worked.
- Fix the booklet writer. Add a test that the booklet output passes `qpdf --check`, then re-impose INV-01003-1.

## Note on Amplify
Your screenshot shows Deployment 1495 at 6:50 AM. That was before this morning's package fix went in. Look for a newer deployment after that commit. It should go green.

## Technical details
- `pdf-server/app/services/pdf_ops.py`: `prepare_for_product` (keep the boxes across CMYK; add `target_bleed_mm`), `resize_pages`
- `pdf-server/app/tasks/operation_tasks.py` / `routes.py` / `schemas/assets.py`: accept `target_bleed_mm`
- `src/lib/documentCentreApi.ts`, `src/pages/dashboard/OrderFiles.tsx`: send the bleed flag and the bleed size
- `pdf-server/app/tasks/production_tasks.py`: guard on reusing the source
- New pytest under `pdf-server/tests/`
