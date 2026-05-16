# Why the dashboard looks "dead"

Your gut is right. After reading the metrics code on both sides, three concrete bugs are making the Document Centre Ops page lie to you. PDF work IS happening on the VPS — the dashboard just isn't measuring it correctly.

## Root causes

1. **CPU% is almost always near zero by design.**
   `pdf-server/app/services/system_metrics.py` calls `psutil.cpu_percent(interval=None)`. That returns the delta **since the last time this same Python process called it**. The API runs as 3 uvicorn workers behind a load balancer, so each `/v1/ops/system` request hits a different process whose "last call" was 15s+ ago — psutil returns 0.0 or near-0.0 every time. It is **not** a host-wide reading.

2. **Queue depth is hardcoded to nothing.**
   `ops_service.queues()` only counts `active / reserved / scheduled` from Celery inspect — it never queries Redis `LLEN documents`, `LLEN imposition`, etc. The Overview tile does `q.depth ?? 0`, but the API never sends `depth`. So that number is meaningless.

3. **"Memory 16%" is the host's idle baseline.**
   Memory IS host-wide and accurate, but a single 18-page PDF upload only adds a few hundred MB on a Celery child for a few seconds. With a 15s poll cadence (and paused-when-tab-hidden), you'll miss the spike every time. There's also no per-worker RSS shown, only `rusage` which is cumulative-since-boot.

4. **Polling is too slow for a Task-Manager feel.**
   `useOpsStream.ts` polls every 15s. Overview queries every 15s. You wanted 1–5s.

5. **Heavy uploads don't even touch the API CPU much.**
   The upload path streams to S3 and enqueues thumbnail/preflight jobs on Celery workers. The heavy LibreOffice/Ghostscript/pikepdf work runs in the `heavy` worker children, not the API. So even with correct CPU sampling, you should look at worker child processes, not the API process.

## Plan

### Backend (pdf-server)

**A. Fix host CPU sampling** — `app/services/system_metrics.py`
- Replace `psutil.cpu_percent(interval=None)` with a module-level background sampler thread that calls `cpu_percent(interval=1.0)` in a loop and caches the latest value. Every HTTP request reads the cached value — so every uvicorn worker sees the same, real, host-wide CPU%.
- Same treatment for `per_core`.

**B. Add real queue depth from Redis** — `app/services/ops_service.py`
- In `queues()`, connect to the broker via `celery_app.connection_for_read()` and `channel.client.llen(queue_name)` for the known queue list (`documents, imposition, pdf, default, thumbnails`). Include `depth` per row.
- Also return total broker depth for the Overview tile.

**C. Per-worker live process stats** — `app/services/ops_service.py::workers()`
- For each Celery worker on this host, locate its parent + child PIDs (psutil `process_iter`, match by command line containing `celery -A app.worker`). Sample `cpu_percent` and `memory_info().rss` per child.
- Return `pool.children: [{pid, cpu_percent, rss_bytes, status}]` plus an aggregate `cpu_percent` and `rss_bytes` per worker.
- This is the "task manager" view — you'll see the heavy worker child light up to 90% CPU and 800 MB RSS the moment a PDF job runs.

**D. New compact "live" endpoint** — `app/web/ops_routes.py`
- `GET /v1/ops/live` returning `{ cpu, memory, queue_depth_total, workers: [{name, cpu, rss, active_tasks}], recent_jobs_count }` in one cheap call. Designed to be polled at 2s without hammering Celery inspect (cache the inspect result for 2s).

### Edge function (proxy)
- `supabase/functions/pdf-api/index.ts` already proxies arbitrary `/v1/ops/*` paths; no change needed, but verify `/v1/ops/live` passes through.

### Frontend

**E. Faster, configurable polling** — `src/pages/platform/PlatformDocumentCentreOverview.tsx` + `src/hooks/useOpsStream.ts`
- Add a refresh-rate selector in the page header: `1s / 2s / 5s / 15s / Paused`, default `2s`. Persist in localStorage.
- Switch the Overview to use the new `/v1/ops/live` endpoint for the four KPI tiles + worker strip; keep `/queues`, `/jobs`, `/health/full` on a slower 10s cadence.
- Keep "pause when tab hidden" as a toggle, but default it OFF on the Overview (you want to leave it open and watch).

**F. New "Live workers" panel** on the Overview
- One row per Celery worker child PID with live CPU bar + RSS. Mirrors Windows Task Manager.
- Shows the heavy/light split clearly so you can confirm `heavy@…` is actually pegging cores during a job.

**G. Sparkline for CPU + Queue depth** (last 60 samples)
- Tiny in-memory ring buffer in the page. No DB writes. Makes spikes visible even when they're sub-second.

## Verification

After deploy:
1. Open the Ops Overview, set refresh = 1s.
2. Upload an 18-page A4 PDF from a tenant portal.
3. You should see: CPU sparkline jump (host), `heavy@…` worker row jump to >50% CPU and RSS climb by 200–800 MB, `documents` queue depth tick to 1 then back to 0, recent jobs list show the thumbnail / preflight tasks.
4. If after all that CPU is still under 30% on a 4-core box for a single 18-page PDF, then the bottleneck is real (likely I/O-bound LibreOffice or single-threaded Ghostscript) and we'll know definitively — not because the dashboard is lying.

## Out of scope
- Changing the actual PDF processing pipeline or worker concurrency.
- Persistent metrics history (would need a timeseries table; the 60-sample sparkline is in-memory only).
- SSE — keeping the polling architecture for now, just much faster.
