# VPS vs Cloud Run — Discrepancy Audit & Fix Plan

The pdf-server code on Cloud Run is the same Python code that ran on the VPS, but the **runtime topology is fundamentally different**. The VPS code worked because of Redis + warm Celery prefork pools + a shared local filesystem + a long-lived LISTEN/NOTIFY listener — none of which exist on Cloud Run. Most current symptoms (slow / missing thumbnails, email delivery flakiness, the 5-minute "dead wait") trace back to those runtime gaps, not to logic bugs.

This plan first lists every discrepancy I can identify from the code, then proposes a tightly scoped set of fixes that restore the VPS behaviour without going back to Redis/Celery.

## Discrepancies found

### 1. Fan-out semantics — biggest single cause of slow thumbnails

**VPS:** `light` worker = `--concurrency=8 -P prefork`. When `generate_previews` enqueued 24 per-page render tasks they were picked up immediately by 8 warm Python children, all reading the PDF from `/var/cache/document-centre/pdf-cache`.

**Cloud Run:** `pdf-worker-light` is deployed with `--concurrency=1 --min-instances=0 --max-instances=20`. Each fan-out task becomes a Cloud Tasks HTTP push that has to (a) trigger a new instance, (b) cold-start Python + load fonts/ICCs, (c) re-download the PDF from S3. With Cloud Tasks dispatch rate limits + cold starts, you typically only get 3–5 pages in flight in the first few seconds — exactly the "batch path rendered 3/24" pattern we saw on job `338b0858…`.

The recent stall-window patch (30 s) papers over it; it does not fix it.

### 2. PDF handoff cache is dead

`document-centre-worker-heavy.service` and `document-centre-worker-light.service` both `mkdir -p /var/cache/document-centre/pdf-cache` and rely on shared local disk so `prepare_for_product` (heavy) can hand the prepared PDF to `generate_previews` (light) without an S3 round-trip. On Cloud Run, heavy and light are separate services with separate ephemeral filesystems, so every preview job re-downloads the full PDF. The code path still tries the cache first, silently misses, and falls back to S3.

### 3. Email delivery — listener removed, fallback chain unreliable

**VPS:** `document-centre-listener-emails.service` held a long-lived `LISTEN email_enqueued` Postgres connection and dispatched `email.scan_outbox` to Celery the instant a row was inserted into `email_outbox`. `worker-emails` ran with `--concurrency=16`, draining `emails-default,emails-control` continuously.

**Cloud Run:** No long-lived listener possible. Replaced with a Supabase Database Webhook → `https://api.document-centre.com/internal/email/notify` → `pdf-worker-emails`. Symptoms seen so far:
- Trigger silently dropped when the URL was missing `https://` (pg_net behaviour).
- `email_outbox.email_account_id` was null on rows enqueued before we landed `resolve_account_id_for_row`; the worker returned `no_email_account` instead of a real SMTP error.
- No periodic "scan_outbox" sweep equivalent — if the webhook fires once and the worker fails transiently, the row sits forever. The VPS listener auto-rescued via the periodic Celery beat sweep.

### 4. Celery Beat → Cloud Scheduler — coverage gaps

VPS `document-centre-beat.service` ran `celery -A app.worker.celery_app beat` reading the in-code beat schedule. On Cloud Run, beat jobs are Cloud Scheduler entries hitting `/internal/tasks/beat/*`. Need to confirm every entry in the VPS beat schedule has a matching Cloud Scheduler job — in particular the email outbox sweep, dead-job reaper, and any production sync ticks.

### 5. Email worker concurrency is far lower

VPS: `--concurrency=16 --max-tasks-per-child=500`. Cloud Run: `--concurrency=1 --max-instances=10`. Under a burst (e.g. one proforma triggering 3–5 emails) you can saturate cold-start budget before the SMTP TLS handshake even starts.

### 6. Queue routing — `ops` queue missing

`pdf-server/app/tasks/` has `ops_tasks.py` / `operation_tasks.py`, but `QUEUE_TO_WORKER_ENV` only knows `documents / imposition / pdf / default / thumbnails / emails-default / emails-control`. Any `enqueue(..., queue="ops")` (or any other queue name not in the map) will raise `Unknown logical queue` at runtime. Need to grep call sites and either add `ops` → light or rename them.

### 7. `--concurrency=1` everywhere defeats in-process parallelism

The light worker's `generate_previews` uses `ThreadPoolExecutor(max_workers=os.cpu_count()-1)` to render multiple pages within a single Celery task. Cloud Run `--concurrency=1` is *request* concurrency, not thread concurrency, so this still works — but only if we route the *whole* job (all 24 pages) into one task instead of fanning out. See Fix A below.

### 8. `max-instances` cap on heavy worker

Heavy = `--max-instances=5`. On the VPS, heavy was 2 prefork children but each job was processed sequentially per child without HTTP-push contention. Five Cloud Run instances should be enough, but if multiple large uploads land simultaneously, Cloud Tasks will queue them behind cold starts.

### 9. Logging / diagnostics regression

VPS systemd → journalctl captured every print; on Cloud Run only `logger.info(...)` lands in Cloud Logging. Several `print(...)` calls in the task files (especially older paths) are effectively invisible.

## Fix plan

Fixes are ordered by impact. Each one is independent.

### Fix A — collapse thumbnail fan-out into a single light-worker call

In `pdf-server/app/tasks/document_tasks.py::generate_previews`:

- When `QUEUE_BACKEND=cloud_tasks`, force `fanout_active = False` regardless of `RENDER_FANOUT_ENABLED`. The in-process `ThreadPoolExecutor` path already renders all pages in parallel inside one container, which is exactly what the VPS prefork pool achieved but without paying N cold starts.
- Keep fan-out enabled for the Celery code path so we don't regress local dev.
- Bump `pdf-worker-light` to `--cpu=4 --memory=4Gi` (already done) and keep `--concurrency=1` so the thread pool gets all 4 vCPUs.
- Increase `--timeout=900` on the light service if not already (it is) and confirm Cloud Tasks dispatch deadline matches.

Expected effect: 24-page job goes from 6 min 33 s to ~60–90 s, no batch/fan-out/salvage dance.

### Fix B — restore the periodic email-outbox sweep

- Add a Cloud Scheduler job that hits `/internal/tasks/beat/email_scan_outbox` every 60 s. The handler should call the existing `email.scan_outbox` logic and re-enqueue any rows in `email_outbox` with `status='queued'` (and any `status='sending'` rows whose `claimed_at` is older than 5 minutes — stuck-claim recovery).
- This restores the safety net the VPS listener had via its beat companion: webhook fires the fast path, the sweep mops up anything dropped.

### Fix C — Audit Cloud Scheduler vs the VPS beat schedule

- Read `app/worker.py` `celery.conf.beat_schedule` and list every entry.
- Cross-check against the Cloud Scheduler jobs created by `pdf-server/docker/gcp-tasks-bootstrap.sh`.
- Add missing entries to the bootstrap script (idempotent) and document them in `pdf-server/docs/VPS_DECOMMISSION.md`.

### Fix D — Verify queue routing covers every `enqueue()` call

- `rg -n 'enqueue\(' pdf-server/app` and confirm every `queue=` value is present in `QUEUE_TO_WORKER_ENV` and `QUEUE_TO_CLOUD_TASKS_QUEUE`.
- Add `ops` (or whatever appears) → `WORKER_URL_LIGHT` + `documents-light` if needed.
- Add a startup self-check in `app.core.queue` that logs unknown queue names rather than crashing the request mid-flight.

### Fix E — Remove the dead PDF handoff cache code path

- In `prepare_for_product` / `generate_previews`, gate the `/var/cache/document-centre/pdf-cache` read/write behind `QUEUE_BACKEND != "cloud_tasks"`. Today it costs a stat call per job and produces a misleading "cache miss" log line. Cheap cleanup, prevents future debugging confusion.

### Fix F — Bump email worker dispatch headroom

- `pdf-worker-emails`: keep `--concurrency=1` (SMTP libraries aren't always thread-safe) but raise `--max-instances=10 → 20` and confirm the `emails-default` Cloud Tasks queue has `--max-dispatches-per-second >= 10` and `--max-concurrent-dispatches >= 20`.
- Set `--min-instances=1` so the first email of a quiet period doesn't pay a cold start (cheap — 512 Mi instance).

### Fix G — Diagnostics

- Convert remaining `print(...)` in `pdf-server/app/tasks/*.py` to `logger.info/warning/error`.
- Add `job_events` rows for: fan-out skipped (reason), batch missing pages, salvage entered, SMTP send started/failed. The VPS gave us journalctl; Cloud Run needs the events table to be the canonical timeline.

### Out of scope (deliberately)

- Re-introducing Redis or Celery on GCP (MemoryStore + a third Cloud Run service) — possible later, but Fix A removes the main reason we'd want it.
- Changing the storage layer.
- Frontend polling changes (already shipped in the previous turn).

## Technical notes

- `QUEUE_BACKEND` env var lives in `pdf-server/app/core/queue.py`; `cloud_tasks` is set on `pdf-api` only — workers don't need it because they receive HTTP pushes.
- `app/email/listener.py` is dead code on Cloud Run; safe to leave in repo for VPS rollback but mark with a module-level comment.
- Cloud Tasks region is `europe-west1`, compute region is `africa-south1` — already correct.
- `RENDER_FANOUT_ENABLED` env var in `app/core/config.py` becomes the local-dev escape hatch after Fix A.

## Validation

After Fix A: upload a 24-page PDF and confirm `generate_previews` finishes in < 2 min with no fan-out lines in logs and no salvage pass.

After Fix B: insert a row directly into `email_outbox` with `status='queued'` and no webhook trigger; confirm Cloud Scheduler picks it up within 60 s.

After Fix F: send 5 emails in a tight loop and confirm all 5 land within 30 s.
