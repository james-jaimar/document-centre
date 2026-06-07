## Problem to fix

The render now gets to 7/8 quickly, which means the primary Ghostscript batch path is no longer the main bottleneck. The remaining failure is the tail path when one page is missing or not yet recorded: the code falls into slower per-page recovery/upload/DB paths, and the frontend can sit at `Rendering pages… (7/8)` for too long before surfacing a failure or recovery.

## What I will change

1. **Keep recovery on the fast Ghostscript path**
   - Update `render_specific_pages` so missing-page recovery uses the same Ghostscript direct-to-JPEG renderer as `generate_previews`, not the older MuPDF-first batch path.
   - This matters because the current screenshot is exactly the recovery case: 7 pages are available, 1 page is missing/stalled.

2. **Stop re-rendering pages that already succeeded**
   - In `generate_previews`, if the batch renderer produced page images on disk but then reported an incomplete page set, upload/record the pages that already exist immediately.
   - Only the missing page should be retried; the system should not drift into a second full per-page render pass for pages 2..8.

3. **Make the final verification DB-based, not memory-only**
   - Before marking a preview job incomplete, query `derived_files` for pages that have both `preview_page` and `thumbnail_page`.
   - This prevents a page uploaded/recorded by a retry/recovery path from being ignored because `completed_pages` in memory missed it.

4. **Add a short stuck-tail guard**
   - Add a backend stall guard around the per-page CPU futures so if a single page process hangs, the job fails quickly with the exact missing page instead of waiting through long Cloud Tasks retries.
   - Keep this scoped to preview rendering; do not change production print-ready generation.

5. **Frontend should not wait silently at 7/8**
   - Reduce the upload modal’s no-progress watchdog from 180s to a tighter preview-specific timeout.
   - When backend marks the job failed with `Incomplete render`, immediately start the existing `/render-pages` recovery path and show `Recovering missing page…` instead of leaving the user thinking it is hung.

6. **Smoke coverage for the exact regression**
   - Extend the Ghostscript smoke script/Python smoke check so it asserts an 8-page PDF returns 8 distinct page files through `rasterize_pages_ghostscript_jpeg` and the single-page retry path writes to `page-008.jpg` correctly.

## Files I expect to edit

- `pdf-server/app/tasks/document_tasks.py`
- `pdf-server/app/services/pdf_ops.py`
- `src/hooks/useDocumentUpload.ts`
- `pdf-server/scripts/smoke-test-ghostscript-render.sh` or `pdf-server/scripts/benchmark-preview-render.sh`

## Expected result

For this 8-page test PDF, the user-visible flow should either:

- finish all 8 pages shortly after the fast batch render, or
- move quickly from `7/8` into explicit one-page recovery, then finish or fail with the exact page number and renderer stderr.

It should no longer sit indefinitely at `Rendering pages… (7/8)`.