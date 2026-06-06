## Findings from the live job

- The active Postnet 24-page asset is `50f5abba-0139-4ad0-bc66-ef7f98c2f500`, preview job `64686803-75ae-4e3c-aaaf-15ce0c1e2045`.
- It is not doing one clean 24-page render. The same job is restarting repeatedly:
  - `18:19:32` render starts
  - `18:20:45` salvage starts
  - `18:21:33` render starts again
  - `18:22:47` salvage starts again
  - `18:23:28` render starts again
  - `18:24:42` salvage starts again
- Derived files are accumulating page-by-page across retries, which matches the slow `6/24`, `7/24`, `8/24` behaviour you are seeing.
- The key discrepancy is in deployment config: `QUEUE_BACKEND=cloud_tasks` and the Cloud Tasks worker URLs are pinned only on `pdf-api`, not on the HTTP worker services. So when `pdf-worker-light` actually runs `generate_previews`, it can still default to Celery mode and take the old fan-out/retry path instead of the intended single-container 4-vCPU batch/in-process path.
- This also affects emails: `scan_outbox` runs on `pdf-worker-emails` and enqueues `send_email`; without Cloud Tasks env on the worker, it can fall back to the wrong queue backend.

## Plan

### 1. Fix Cloud Run worker environment parity
Update `.github/workflows/pdf-server-deploy.yml` so after worker URLs are resolved, the deploy updates **all** Cloud Run services with the same queue backend values:

- `pdf-api`
- `pdf-worker-heavy`
- `pdf-worker-light`
- `pdf-worker-emails`

Shared values:

```text
QUEUE_BACKEND=cloud_tasks
GCP_PROJECT_ID=...
GCP_REGION=africa-south1
GCP_TASKS_REGION=europe-west1
TASKS_INVOKER_SA=...
WORKER_URL_HEAVY=...
WORKER_URL_LIGHT=...
WORKER_URL_EMAILS=...
```

Keep each worker's own `WORKER_SELF_URL` as well, so OIDC verification still works.

### 2. Belt-and-braces guard in `generate_previews`
Harden `pdf-server/app/tasks/document_tasks.py` so fan-out is disabled not only when `QUEUE_BACKEND=cloud_tasks`, but also whenever the service role is an HTTP worker (`ROLE=worker-*-http`).

That means even if someone forgets an env var later, `pdf-worker-light` will not accidentally dispatch per-page render tasks via the old Celery-style fan-out path.

### 3. Improve diagnostics for the next upload
Add lightweight job events/logs around the preview phases so the next 24-page test tells us exactly where time went:

- batch rasterisation start/finish
- batch uploaded/recorded count
- in-process fallback start/finish
- salvage start/finish
- final timing metadata on success or failure

No frontend change needed for this; it is for Cloud Logging / `job_events` evidence.

### 4. Confirm worker health exposes the right runtime mode
Extend the existing `/health` response to include safe non-secret runtime facts:

```text
role
queue_backend
cpu_count
render_cpu_concurrency
render_io_concurrency
render_batch_threshold
```

This makes future cutover drift immediately visible without digging through Cloud Run env pages.

### 5. Validation after deploy
After the GitHub Action redeploys:

- Upload the same 24-page PDF on Postnet.
- Expected behaviour: one `generate_previews` run, no repeated render/salvage cycles, target under ~60–90 seconds.
- Confirm `job_events` shows either:
  - batch path rendered `24/24`, or
  - in-process pass completed once, not multiple Cloud Tasks retries.
- Confirm `pdf-worker-emails` can enqueue `send_email` through Cloud Tasks, so the email path is not silently using the wrong backend.

## Optional immediate recovery
Once the deploy is live, the current stuck/partial job should be abandoned and the asset should be re-rendered cleanly rather than waiting for Cloud Tasks retries to drip-feed pages.