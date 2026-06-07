## What I found

The upload UI progress such as `Rendering pages… (2/8)` and `(6/8)` comes from `src/hooks/useDocumentUpload.ts`, while it polls the PDF backend for `derived_files` and the Cloud Tasks-backed `generate_previews` job.

I could not read live Supabase/Edge logs because the current Supabase tool access is forbidden, so this plan is based on the actual code path and recent git history.

The strongest code-level suspect is in `pdf-server/app/web/tasks_routes.py`: when Cloud Tasks retries a task and the job row is already `running`, the handler returns `200 OK` with `skipped: in_flight`. That is safe only if the first attempt is genuinely still alive. If the first attempt died after marking the DB job `running`, the retry gets acknowledged as successful, Cloud Tasks deletes it, and the job stays stuck forever with only some pages rendered.

That exactly matches “stuck at 2/8” or “6/8”: partial `derived_files` exist, but no live worker is left to finish the job.

## Plan

1. **Fix Cloud Tasks retry idempotency**
   - Change `pdf-server/app/web/tasks_routes.py` so a retry that sees a recent `running` job does **not** return `200 OK`.
   - Return a retryable response instead, so Cloud Tasks keeps the task alive until either:
     - the original attempt completes, then the retry sees `completed` and acknowledges safely, or
     - the `running` marker becomes stale, then the retry is allowed to re-execute the task.
   - Keep the existing safe `completed` / `cancelled` skip behaviour.

2. **Make stale-running recovery faster for customer uploads**
   - Reduce the “running but stale” window for Cloud Tasks retry guard from 15 minutes to a shorter configurable value for preview tasks.
   - Use a conservative default that prevents duplicate active rendering but does not leave customers waiting indefinitely after a worker crash.

3. **Harden the frontend render wait**
   - In `renderDocumentThumbnails`, detect a render job that remains `running` while `derived_files` count has not moved for a sustained period.
   - If stalled, call the existing `render-pages` recovery endpoint for missing pages instead of waiting only on the original job forever.
   - Keep the final verification: do not mark the document `ready` until all expected pages have thumbnail paths.

4. **Improve backend final-state visibility**
   - Ensure `generate_previews` and `render_specific_pages` always leave the job in a terminal state on known incomplete renders.
   - Keep the asset out of `ready` if pages are missing, but surface the missing page numbers so the UI can recover or show a real error.

5. **Validation**
   - Verify with an 8-page upload path that progress reaches all pages and the document row flips to `ready`.
   - Verify a simulated retry does not acknowledge a still-running job unless it has actually completed.
   - Check PostNet and Demo Center flows specifically, because both use anonymous/customer storefront auth plus the same PDF rendering pipeline.

## Files to change

- `pdf-server/app/web/tasks_routes.py`
- `pdf-server/app/core/config.py`
- `src/hooks/useDocumentUpload.ts`

## Deployment note

These are backend + frontend changes. The Cloud Run fix will go live after the pdf-server deploy workflow runs from GitHub/AWS Amplify source; frontend changes still need the normal publish/update flow for the web app.