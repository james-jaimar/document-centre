## What I believe is happening

This is not Ghostscript “choosing” to skip page 5 or page 8. The current Cloud Run code now has too many layers around Ghostscript:

- A full-document Ghostscript batch render.
- A per-page retry path.
- A record-existing/upload/database path.
- A salvage path.
- A frontend watchdog that can trigger `/render-pages` while the backend may still be processing.
- A separate recovery endpoint that renders a range between the lowest/highest missing page, not just the exact missing pages.

That means the UI can say “missing pages” when the real problem may be: render output naming, upload/DB recording, timeout, stale polling, or a second recovery job colliding with the first. This is drift from the VPS-style flow, and it is why the behaviour feels chaotic.

## Plan

1. **Make one server-side render contract, not multiple competing ones**
   - Keep the primary path as: prepare final PDF → one Ghostscript render → validate all pages → thumbnail/upload/record all pages → mark ready.
   - Remove the frontend’s early “stall means recover” behaviour for normal renders. The client should not launch recovery while the server render is still alive.

2. **Fix recovery so it only renders the exact missing pages**
   - Change `render_specific_pages` so a request for `[5]` renders page 5 only, not the whole range `min..max`.
   - If `[2,5,8]` is requested, render those pages as exact single-page operations or exact contiguous groups, never unrelated pages.

3. **Make Ghostscript output naming deterministic**
   - For batch renders, write to a temporary sequential directory, then copy/rename into final `page-001.jpg … page-N.jpg` only after validation.
   - For single-page renders, always write directly to `page-NNN.jpg`.
   - This removes collisions and stale-file false positives.

4. **Stop calling valid local renders “missing” because recording failed**
   - Keep the distinction already started: `raster_missing` vs `record_missing`.
   - If the JPEG exists locally and validates, retry thumbnail/upload/DB recording without re-rendering that page.
   - Record the exact failed phase in `job_events`.

5. **Increase the frontend patience and make progress honest**
   - Remove/disable the 60s client-side render watchdog for active backend jobs.
   - Let `pollJob` wait for the backend terminal state.
   - Only call `/render-pages` after the render job has actually failed with explicit missing pages, or after the job completed but derived files are genuinely absent.

6. **Add targeted diagnostics for this exact incident**
   - Add `job_events` metadata for: requested pages, pages rendered locally, pages uploaded, pages recorded, missing phase, Ghostscript rc/stderr tail, elapsed time, Cloud Run revision, queue/backend role.
   - This gives us evidence instead of guessing when the next upload runs.

7. **Add a reproducible 8-page smoke test matching the customer path**
   - Generate or use an 8-page A5 PDF.
   - Run A5→A4 prepare/resize.
   - Run preview rendering.
   - Assert 8 valid previews and 8 thumbnails are recorded.
   - Assert recovery for page 5 renders page 5 only.

## Files to change

- `pdf-server/app/services/pdf_ops.py`
  - Harden Ghostscript batch/single-page output handling.

- `pdf-server/app/tasks/document_tasks.py`
  - Simplify `generate_previews` completion/recovery logic.
  - Fix `render_specific_pages` to render exact requested pages.
  - Improve job-event diagnostics.

- `src/hooks/useDocumentUpload.ts`
  - Stop triggering recovery from an active-job timeout.
  - Only recover after explicit backend failure or verified missing derived files.

- `pdf-server/scripts/smoke-test-ghostscript-render.sh`
  - Add exact-page recovery and A5→A4-style assertions.

## Expected result

Uploads should no longer jump into “Recovering missing pages…” while the backend is still rendering. If Ghostscript or recording truly fails, the system will say exactly which phase failed and recover only the affected page(s), instead of launching overlapping recovery work that can hang the modal.