
## Goal

Two related problems on `/platform/document-centre`:

1. **Stuck "running" jobs in `job_events`** — rows whose Cloud Run task has long finished (success, fail, or process killed) still show `status='running'`. We can't trust the dashboard until we verify against GCP and auto-reconcile.
2. **The Overview / Workers / Queues pages are still VPS-shaped.** They show Celery `inspect` + psutil per-process data that doesn't exist on Cloud Run, so 95% of the panels read "—" or "No workers visible". We need GCP-native equivalents (Cloud Tasks queue stats, Cloud Run revision/instance/CPU/request metrics, recent Cloud Run logs in-page).

We keep the existing pages and routes; we swap the data sources behind them and add a reconciler.

---

## Part A — Verify and reconcile stuck `running` rows

### A1. Diagnose (no code, just a SQL/edge call you run once)

In Supabase SQL editor:

```sql
select id, job_id, task_name, queue_name, stage, status,
       started_at, finished_at, duration_ms,
       (extract(epoch from (now() - started_at)) / 60)::int as running_minutes,
       left(coalesce(message,''),140) as msg,
       metadata_json->'runtime'->>'k_revision' as k_revision,
       metadata_json->'runtime'->>'k_service'  as k_service
from job_events
where status = 'running'
  and started_at > now() - interval '7 days'
order by started_at desc
limit 50;
```

This tells us (a) how many are truly orphaned, (b) which Cloud Run revision wrote them, (c) whether the worker died mid-task or never wrote a terminal event.

### A2. New ops endpoint: `POST /v1/ops/jobs/reconcile`

In `pdf-server/app/services/ops_service.py` + `pdf-server/app/web/ops_routes.py`:

- Find `job_events` with `status='running'` AND `started_at < now() - configurable grace` (default 15 min, override per-stage e.g. `generate_previews` = 30 min).
- For each, look up the matching Cloud Tasks task (if `task_name` is stored on the event) via `CloudTasksClient.get_task`. If the task no longer exists in the queue, the Cloud Run dispatch has already finished — mark the row `failed` with `message='reconciled: cloud task gone, no terminal event written'` and set `finished_at=now()`, `duration_ms=now-started_at`.
- For rows older than a hard ceiling (e.g. 2 hours) with no matching task and no later sibling event for the same `job_id`, force-fail regardless.
- Write an `ops_audit` entry per reconciled row.
- Return `{ scanned, reconciled, still_running, sample: [...] }`.

### A3. Schedule it

Cloud Scheduler hits `POST /v1/ops/jobs/reconcile` every 5 minutes (deferred — note in plan; only needs a one-line gcloud command, no code change).

### A4. UI: "Reconcile stuck jobs" button + stuck count

On `PlatformDocumentCentreJobs.tsx`:

- Add a top-right counter: `N jobs running > 15min` (computed client-side from existing `opsApi.jobs({ status: 'running' })`).
- Add a "Reconcile now" button that calls a new `opsApi.reconcileJobs()` → `POST v1/ops/jobs/reconcile`, then refetches the list and toasts the result.

---

## Part B — GCP-native live monitoring on the Overview page

### B1. New backend endpoint: `GET /v1/ops/gcp/live`

In `ops_service.py`, add `gcp_live()` that returns a single composed snapshot the Overview page can poll every 2–5 s:

```jsonc
{
  "captured_at": 1733600000,
  "cloud_run": {
    "service": "pdf-api",
    "region": "africa-south1",
    "current_revision": "pdf-api-00042-abc",
    "instances": { "active": 2, "idle": 1, "max": 10 },
    "cpu_utilization": 0.62,           // mean across instances, last 1m
    "memory_utilization": 0.41,
    "request_count_1m": 87,
    "request_latency_p95_ms": 1240,
    "container_startup_latency_ms": 980
  },
  "cloud_tasks": {
    "queues": [
      { "id": "pdf-light", "tasks_count": 0, "concurrent_dispatches": 1,
        "executed_last_minute": 12, "oldest_eta": null },
      { "id": "pdf-heavy", "tasks_count": 3, "concurrent_dispatches": 2,
        "executed_last_minute": 4,  "oldest_eta": "2026-06-07T10:12:03Z" }
    ],
    "total_pending": 3,
    "total_in_flight": 3
  },
  "workers_http": [
    { "service": "pdf-worker-light", "revision": "...", "active_requests": 2,
      "cpu": 0.71, "memory": 0.38 },
    { "service": "pdf-worker-heavy", "revision": "...", "active_requests": 1,
      "cpu": 0.92, "memory": 0.55 }
  ],
  "recent_jobs_5m": { "ok": 41, "failed": 2, "running": 6 }
}
```

Data sources:

- **Cloud Tasks**: reuse `_cloud_tasks_queue_stats()` (already implemented).
- **Cloud Run instance/CPU/memory/request metrics**: Cloud Monitoring `projects.timeSeries.list` for metric types:
  - `run.googleapis.com/container/instance_count`
  - `run.googleapis.com/container/cpu/utilizations`
  - `run.googleapis.com/container/memory/utilizations`
  - `run.googleapis.com/request_count`
  - `run.googleapis.com/request_latencies`
  - `run.googleapis.com/container/startup_latencies`
  filtered by `resource.labels.service_name in (pdf-api, pdf-worker-light, pdf-worker-heavy)`, aligned 60s.
- **Recent jobs**: existing `JobEvent` query over the last 5 min.

All Monitoring calls go through the existing `google.auth.default()` ADC; the Cloud Run runtime service account just needs `roles/monitoring.viewer` (note this in the plan; one `gcloud` line to add).

### B2. New backend endpoint: `GET /v1/ops/gcp/logs`

Wrapper around the existing `cloud_run_logs(...)` that:
- accepts `service`, `severity` (`>=WARNING` etc), `minutes`, `limit`, `search`,
- returns the same shape but adds a `service` filter (`resource.labels.service_name = "<service>"`).

### B3. Frontend: rewrite `PlatformDocumentCentreOverview.tsx` for Cloud Run

Replace the VPS-only panels with GCP-native ones (same page, same route):

1. **Header tiles (4)**: Cloud Run instances active/max · Cloud Run mean CPU% · Cloud Run mean memory% · Cloud Tasks total pending.
2. **Cloud Run services panel**: one row per service (`pdf-api`, `pdf-worker-light`, `pdf-worker-heavy`) showing revision, active requests, CPU%, memory%, request p95, startup latency. Sparklines for CPU + request count from a local 60-sample ring buffer (same pattern as today).
3. **Cloud Tasks queues panel**: per-queue depth, concurrent dispatches, executed/min, oldest ETA (with red badge when > 5 min old).
4. **Recent jobs panel**: last 5 min summary (ok / failed / running) + the existing recent-jobs stream.
5. **Live Cloud Run logs panel**: tail of `WARNING+` entries for the selected service, polled every 10 s via `/v1/ops/gcp/logs?severity=WARNING&minutes=15`. Severity selector + free-text search input. This replaces the "no Celery workers visible" placeholder.

The existing "Live workers" Celery/psutil card is removed (it's structurally impossible on Cloud Run — concurrency=1, no master/child processes, no Celery `inspect`).

`opsApi.ts` gets three new methods:

```ts
gcpLive: () => call<GcpLiveSnapshot>("v1/ops/gcp/live"),
gcpLogs: (q: { service?: string; severity?: string; minutes?: number; limit?: number; search?: string }) =>
  call<{ entries: GcpLogEntry[]; error?: string }>("v1/ops/gcp/logs", "GET", undefined, q),
reconcileJobs: (grace_minutes?: number) =>
  call<{ scanned: number; reconciled: number; still_running: number }>("v1/ops/jobs/reconcile", "POST", { grace_minutes }),
```

### B4. Workers / Queues pages

- `PlatformDocumentCentreQueues.tsx`: switch from Celery `queues()` to the Cloud Tasks block of `gcpLive()`. Keep the "peek / purge" buttons but back them with `CloudTasksClient.list_tasks` and `purge_queue` instead of Celery RabbitMQ.
- `PlatformDocumentCentreWorkers.tsx`: replace Celery worker rows with one row per Cloud Run service revision (data from `gcpLive().workers_http`). Remove "shutdown / poolGrow / poolShrink / cancelConsumer" controls — they don't apply. Keep "view logs" linking to the new logs panel pre-filtered by service.

---

## Technical notes

- All new endpoints go under `v1/ops/*` so they keep the existing `pdf-api` edge-function gate (platform_admin only) — no new auth wiring.
- Cloud Monitoring + Cloud Tasks calls use ADC; the Cloud Run service account needs:
  - `roles/monitoring.viewer`
  - `roles/cloudtasks.viewer` (already has `cloudtasks.enqueuer`; viewer adds `get_queue`/`list_tasks`)
  - `roles/logging.viewer` (already in use for `cloud_run_logs`)
- Reconciler grace defaults: `generate_previews=30m`, all others `15m`, hard ceiling `2h`. Surfaced as env vars `OPS_RECONCILE_GRACE_*` so we can tune without redeploying code.
- The reconciler **does not** retry the job — it only marks it failed and records the orphan reason. Re-running is the user's decision via the existing requeue button.
- The Overview rewrite removes ~80 lines of Celery-specific code; no other page reads `OpsLiveSnapshot.workers` (verified), so the type can be deleted alongside.

---

## Out of scope

- Migrating job_events to a more event-sourced model.
- Per-tenant GCP cost surfacing (Cloud Billing API) — separate task.
- Auto-retry of reconciled-failed jobs.

---

## Files touched

- `pdf-server/app/services/ops_service.py` — add `gcp_live()`, `gcp_logs()`, `reconcile_running_jobs()`.
- `pdf-server/app/web/ops_routes.py` — three new routes.
- `pdf-server/app/core/config.py` — `OPS_RECONCILE_GRACE_DEFAULT/PREVIEWS/CEILING` settings.
- `src/lib/opsApi.ts` — add `gcpLive`, `gcpLogs`, `reconcileJobs`; new types.
- `src/pages/platform/PlatformDocumentCentreOverview.tsx` — rewrite around Cloud Run.
- `src/pages/platform/PlatformDocumentCentreQueues.tsx` — switch to Cloud Tasks.
- `src/pages/platform/PlatformDocumentCentreWorkers.tsx` — switch to Cloud Run services.
- `src/pages/platform/PlatformDocumentCentreJobs.tsx` — stuck-count badge + "Reconcile now" button.

No DB migrations.
