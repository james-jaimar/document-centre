# PDF server performance — diagnosis & plan

Good news first: the code we wrote is correct. The bad news: **on the live box it isn't running**. That's why you see no difference.

## What the data says (last 7 days of `job_events`)

| Stage | Queue | n | p50 | p95 | max |
|---|---|---|---|---|---|
| `render` (full preview job) | thumbnails | 93 | 15.0 s | **62.0 s** | 335.8 s |
| `inspect` (PDF metadata) | documents | 98 | 2.4 s | 5.2 s | 8.5 s |
| `page_batch` (5 pages uploaded) | thumbnails | 407 | 0.25 s | 0.26 s | 0.49 s |
| `salvage` (re-render missing) | thumbnails | 1 | 247 s | — | — |

**Worker name in every single event over the past 24 hours:** `celery@srv1516161`.

That is the **old single-pool worker** (`document-centre-worker.service`, queues `default,documents,thumbnails,imposition,pdf`, concurrency 4). The new units we wrote — `heavy@<host>` (concurrency 2) and `light@<host>` (concurrency 4) — have produced **zero** events. They aren't installed/started, or they're masked, or the old unit is still active and beat them to the queues.

So the 4 vCPU / 16 GB upgrade is being consumed by **one** Celery worker with 4 children competing on the same pool, plus uvicorn. That's why "more CPU/RAM" didn't move the needle.

## Three real bottlenecks (in priority order)

### 1. The new worker split is not active on the box
This is the headline fix. Until `heavy@` and `light@` show up in `job_events.worker_name`, none of our sizing work matters.

Need to, on the Ubuntu host:
- `systemctl disable --now document-centre-worker.service` (deprecated single-pool)
- `systemctl daemon-reload`
- `systemctl enable --now document-centre-worker-heavy.service`
- `systemctl enable --now document-centre-worker-light.service`
- Verify: `celery -A app.worker.celery_app inspect active_queues` should list **two** nodes (heavy + light).

I'll add an idempotent `scripts/migrate-to-split-workers.sh` that does exactly this and is safe to re-run, plus update `install-ubuntu.sh` so a fresh deploy never lands on the old unit again.

### 2. In-process page rendering is single-threaded per job
`generate_previews` does the **page-1 fast path serially**, then the rest in a `ThreadPoolExecutor(max_workers=UPLOAD_CONCURRENCY=8)`. But inside `_render_one_page`, **Ghostscript runs single-threaded** (`pdf_ops.rasterize_preview` shells out one `gs` invocation per page).

A 50-page PDF therefore gets at best 8-way parallelism on rasterize+upload. With 4 vCPU available and Ghostscript being CPU-bound, the right shape is:

- Cap render parallelism at **`min(UPLOAD_CONCURRENCY, cpu_count)`** so we don't context-switch 8 GS processes onto 4 cores.
- Split into two thread pools: a **CPU pool** sized to `cpu_count - 1` for rasterize+downscale, and an **I/O pool** of 8 for S3 upload + DB write. That lets uploads overlap the next page's rasterization instead of blocking a CPU slot.
- Make both sizes env-tunable: `RENDER_CPU_CONCURRENCY` (default 3 on a 4 vCPU box) and `RENDER_IO_CONCURRENCY` (default 8).

Expected impact on a 50-page job: render p50 from ~15 s down to ~6-8 s once heavy/light split is also live.

### 3. `inspect` p95 of 5 s is too slow for what it does
`inspect` is just pikepdf metadata read. 5 s p95 means we're re-downloading the normalised PDF from S3 every call. The `normalize_asset` task already produced `info` in-process, but then the redundant `inspect_asset` path (still wired for explicit calls) downloads the file again.

Two cheap wins:
- Cache `(page_count, width_pt, height_pt, boxes)` we already computed in `normalize_asset` — currently we save them on the asset row, so the explicit `/inspect` endpoint should short-circuit when those columns are populated and the file mtime hasn't changed.
- For `crop-rasterize` / `print-ready` follow-ups, pass the local workspace path through instead of re-downloading.

### Bonus: the `salvage` stage took 247 s on the one job that used it
That's because salvage runs **fully sequential** (loop, no pool). When it triggers we lose all the parallelism we just added. Apply the same CPU+IO pool to the salvage loop with `max_workers=2` (small, since salvage is by definition the unhappy path).

## Technical changes (build mode)

1. `pdf-server/scripts/migrate-to-split-workers.sh` — new, idempotent: stop+disable old unit, install the two new unit files if missing, daemon-reload, enable+start both, print `systemctl status` for each.
2. `pdf-server/scripts/install-ubuntu.sh` — call the migration helper at the end so any reinstall is self-healing.
3. `pdf-server/app/core/config.py` — add `render_cpu_concurrency` (default `max(1, os.cpu_count()-1)`) and `render_io_concurrency` (default 8).
4. `pdf-server/app/tasks/document_tasks.py`:
   - Replace the single `ThreadPoolExecutor(UPLOAD_CONCURRENCY)` block with a **two-pool** design (CPU pool wraps `pdf_ops.rasterize_preview` + `downscale_to_thumbnail`; IO pool wraps `storage.upload` + `_record_preview`). Pages stream from CPU → IO so the next page can start rasterising while the previous uploads.
   - Apply the same shape (smaller pools) to the salvage loop.
   - Keep the per-page subdir isolation that prevents Ghostscript output collisions.
5. `pdf-server/app/tasks/document_tasks.py::inspect_asset` — short-circuit when `asset.page_count` and `asset.boxes` are already populated; only re-download if `force=True` (add to the route).
6. `pdf-server/app/web/routes.py` — accept `?force=true` on the explicit `/inspect` endpoint.
7. `pdf-server/COOLIFY_DEPLOYMENT.md` + `deploy/ubuntu/SETUP_STEPS.md` — note the migration step and how to verify with `celery inspect active_queues`.

## How we'll prove it worked

After deploy I'll re-query `job_events` for the next 24 h and compare:
- `worker_name` should show **both** `heavy@…` and `light@…`.
- `render` p50 should drop from 15 s → ≤ 8 s on similar-size jobs.
- `inspect` p95 should drop from 5 s → < 1 s for cached calls.
- No `inspect` events at all for the standard upload path (already removed in current code, will confirm).

Want me to go ahead with all of this in build mode?
