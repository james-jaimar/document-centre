## What I found from the actual Postnet upload

The slow 8-page A4 upload is not primarily Ghostscript CPU time.

Actual production rows show:

- Asset: `ced3d7c3-4779-4031-b31b-69b5fb6a5490`
- `prepare_for_product`: **14.1s** total
- `generate_previews`: **112.6s** total from job creation to completion
- Successful render result reports:
  - `download_pdf`: **498ms**
  - `ghostscript_batch`: **1.585s**
  - `batch_total`: **16.5s**
- But the same preview job had an earlier render attempt that started, wrote pages, entered salvage, then a later attempt re-ran the same job. That means the delay is coming from **Cloud Tasks/Cloud Run retry/cold-start/IO/DB recording behaviour**, not the 4-vCPU rasterizer failing to rasterize quickly.

Current upload map:

```text
Browser file upload
  -> s3-storage sign-upload
  -> direct S3 PUT
  -> documents insert
  -> pdf-api /v1/assets inline inspect
  -> optional normalize_orientation
  -> prepare_for_product on heavy worker
  -> chained generate_previews on light worker
  -> Ghostscript batch rasterize
  -> PIL thumbnail downscale
  -> S3 upload preview + thumbnail per page
  -> derived_files rows per page
  -> UI polls jobs + derived files
```

## Plan

### 1. Make Cloud Tasks retries visible and safe

Update `pdf-server/app/core/queue.py` and `pdf-server/app/web/tasks_routes.py` to:

- Set an explicit Cloud Tasks dispatch deadline matching the worker timeout, so long-but-valid render requests are not retried prematurely.
- Capture Cloud Tasks headers (`X-CloudTasks-TaskRetryCount`, `X-CloudTasks-TaskExecutionCount`, task name, queue name) in logs/job events.
- Prevent duplicate concurrent execution of the same `job_id` when Cloud Tasks retries while a worker is still alive.
- Add a stale-running guard so genuinely abandoned jobs can still be retried instead of getting stuck forever.

### 2. Add real per-stage render timings

Update `pdf-server/app/tasks/document_tasks.py` to record timings for:

- Cloud task attempt number
- PDF download/cache source
- render-box preparation
- Ghostscript batch time
- thumbnail downscale time
- S3 upload time per page
- DB record time per page/batch
- salvage start/finish
- total wall-clock time

This will make the next upload explain itself without guessing from sparse progress messages.

### 3. Remove the per-page DB commit bottleneck

Update `pdf-server/app/services/derived_files.py` and add a migration to:

- Add a unique partial index for one `preview_page` and one `thumbnail_page` per `(asset_id, page)`.
- Add a bulk upsert method for per-page derived files.
- Use one DB transaction for a batch of page records instead of 16+ individual select/update/commit cycles for an 8-page PDF.

This targets the observed gap where Ghostscript is ~1.6s but the page write/upload/record phase stretches into many seconds.

### 4. Harden and speed S3 uploads/downloads

Update `pdf-server/app/services/storage.py` to:

- Configure the boto3 S3 client with explicit connect/read timeouts.
- Increase the connection pool for parallel preview uploads.
- Use bounded retry behaviour so one stuck thumbnail upload cannot silently hold the whole render for a minute.
- Log object size + upload duration for preview/thumbnail files.

Also switch preview-page upload order to favour thumbnails first where safe, so the UI gets usable page progress earlier.

### 5. Restore VPS-style warm workers

Update `.github/workflows/pdf-server-deploy.yml` to keep the customer-facing workers warm:

- `pdf-worker-light`: `min-instances=1` so thumbnail rendering does not pay a cold start.
- Consider `pdf-worker-heavy`: `min-instances=1` if the 10–15s prepare step is still part of the critical upload path.

This matches the VPS behaviour where the light Celery workers were always resident.

### 6. Reduce unnecessary preview blocking for clean A4 PDFs

For clean PDF uploads that already match the product and do not need an advisory:

- Render customer thumbnails from the inspected/normalized PDF immediately.
- Move `prepare_for_product` out of the blocking preview path where it is not required for the visual preview.
- Keep print-ready preparation for the production/order artefact path, or run it asynchronously after the preview is already usable.

This removes the extra ~14s currently paid before rendering, without weakening the final production file flow.

### 7. Add a regression check

Add a small backend smoke script/test that processes a known 8-page A4 PDF and prints:

```text
upload/register time
prepare time
render total
ghostscript time
s3 time
db record time
pages rendered
retry count
```

Acceptance target for the 8-page A4 case:

- No duplicate render attempt.
- No salvage for normal pages.
- Ghostscript batch remains under a few seconds.
- End-to-end visible preview target: roughly **30–60s**, with first thumbnail much sooner.

## Files to change

- `.github/workflows/pdf-server-deploy.yml`
- `pdf-server/app/core/queue.py`
- `pdf-server/app/web/tasks_routes.py`
- `pdf-server/app/tasks/document_tasks.py`
- `pdf-server/app/services/derived_files.py`
- `pdf-server/app/services/storage.py`
- Supabase migration for the derived-file uniqueness/upsert support
- Optional smoke-test script under `pdf-server/scripts/`

