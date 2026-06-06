## Findings

- The upload was not endlessly rendering: job `338b0858-2e55-43ef-a09c-28f239cd3edf` eventually completed after about 6m33s.
- The slow part was not Ghostscript itself: DB timings show batch rasterisation took about 2.6s and the batch phase about 40s.
- The delay came after the batch only produced a few recorded pages, then the worker waited through the full fan-out timeout before the salvage pass recovered the remaining pages.
- The `181 messages` are mostly our own frontend debug log in `documentCentreApi.ts`, printing every `/jobs/:id` and `/derived-files` poll.

## Plan

1. **Stop console spam**
   - Remove or gate the noisy `[doc-centre] GET ...` log behind an explicit debug flag.
   - Keep warnings/errors so real failures still show up.

2. **Make upload progress polling lighter**
   - Use the existing `/v1/assets/:asset_id/events` endpoint for live progress instead of repeatedly fetching all `/derived-files` during render.
   - Fetch `/derived-files` once at the end, or only when the job is terminal / recovery is needed.

3. **Remove the 5-minute dead wait in thumbnail rendering**
   - In `generate_previews`, when the batch path is used for normal-sized files and some pages are missing, skip the fan-out wait and immediately run the local in-process fallback/salvage for the missing pages.
   - Keep fan-out for genuinely large documents where it is useful.

4. **Improve backend diagnostics**
   - Record batch missing pages and fallback timing into `job_events` / job result so we can see why pages fell through without relying only on Cloud Run logs.
   - Ensure final job results include accurate `thumbnail_storage_path` / `preview_storage_path` when page 1 lands through fallback.

5. **Validation after implementation**
   - Re-run the same 24-page upload.
   - Confirm the console no longer floods with request logs.
   - Confirm the render avoids the 300s fan-out timeout and completes in roughly the batch + fallback time instead of 6+ minutes.