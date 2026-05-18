## What I found

- The browser console is empty because the failure is not happening in React.
- The network/Edge logs show the real issue: `production-pdf` is returning `504` after about `101s`.
- The VPS is reachable and healthy at `https://document-centre-api.jaimar.dev`.
- The Assemble click successfully creates VPS jobs, but they remain stuck as `queued`:
  - `assemble_print_ready`, queue `documents`, status `queued`, never started.
- The worker config explains why: `pdf-server/app/worker.py` does **not include** `app.tasks.production_tasks`, so Celery does not register the `assemble_print_ready_for_job`, `assemble_imposed_sheet_for_job`, or `render_job_ticket_for_job` tasks. The API queues them, but no worker can execute them.
- There is a second product problem: the Edge Function waits synchronously for up to 90s, so even once workers run, large PDFs can still make the admin button look like it is just spinning.

## Plan

1. **Register the production worker tasks**
   - Update `pdf-server/app/worker.py` to include `app.tasks.production_tasks`.
   - This is the immediate reason VPS production jobs are sitting in `queued`.

2. **Stop the admin button from waiting on a long Edge Function**
   - Change `production-pdf` so it dispatches the VPS job, stores the upstream `pdf_job_id`/status on `order_jobs`, and returns immediately with `202 Accepted`.
   - Use `EdgeRuntime.waitUntil` for a background status watcher where appropriate, but do not rely on the browser request staying open.

3. **Add observable production status fields**
   - Add fields on `order_jobs` for production artefact status/error/job id, e.g. print-ready/imposition/ticket status and last error.
   - The VPS already persists final PDF paths; these fields will make queued/running/failed visible to the UI.

4. **Poll from the admin UI**
   - Update `useProductionArtefacts` to poll while an artefact is queued/running and stop when a path appears or an error is recorded.
   - Change the Production panel button text/status from a blind spinner to clear states like `Queued`, `Processing`, `Failed`, `Ready`.

5. **Validate against the real VPS path**
   - After implementation, deploy/test the Edge Function and check:
     - `production-pdf` returns quickly instead of 504.
     - VPS jobs move from `queued` to `running/completed` after worker registration.
     - `order_jobs.print_ready_pdf_path` updates and the admin download button appears.

## Expected result

Clicking **Assemble** should no longer hang silently. It should return immediately, show the actual processing state, and either produce the print-ready PDF or show the real failure message.