## Current state (why nothing is using the upgrade)

- **API (`uvicorn`)**: started with no `--workers` flag → exactly **1 process, 1 thread**. Cannot use more than 1 vCPU regardless of host size. Both `start-api.sh` and the systemd unit `document-centre-api.service` are affected.
- **Celery worker**: started with no `--concurrency` and no `-P` flag → defaults to `prefork` with concurrency = CPU count, BUT only one worker node, all heavy queues (`documents`, `thumbnails`, `imposition`, `pdf`) competing in the same prefork pool. A single LibreOffice / Ghostscript job can starve the small thumbnail jobs.
- **No memory or task limits set** → nothing caps RAM per child, no `--max-tasks-per-child` (LibreOffice/Ghostscript leak), no `--max-memory-per-child`.
- **Beat / API / Worker** all run as `root` on one box with no resource hints.

Net effect on a 4 vCPU / 16GB box: API caps at ~1 core; Celery uses cores but with no isolation between fast and slow queues, and no memory recycling.

## Plan

### 1. API: run multi-worker uvicorn

Update both `pdf-server/scripts/start-api.sh` and `pdf-server/deploy/systemd/document-centre-api.service` to:

```
uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --workers 3 --proxy-headers --forwarded-allow-ips="*" \
  --timeout-keep-alive 30
```

Rationale: 3 API workers leaves 1 vCPU headroom for Celery bursts + nginx + redis. Each uvicorn worker is single-threaded async, so 3 is the right number for 4 vCPU when Celery shares the host.

(Leave dev script alone — `--reload` requires single worker.)

### 2. Celery: split into two specialised worker units

Replace the single `document-centre-worker.service` with two systemd units sharing the same code, so heavy PDF/Office jobs can't block fast thumbnail/default jobs.

**`document-centre-worker-heavy.service`** — CPU-bound PDF/Office work
```
ExecStart=/opt/document-centre-api/.venv/bin/celery -A app.worker.celery_app worker \
  -l info -Q documents,imposition,pdf -n heavy@%H \
  --concurrency=2 -P prefork \
  --max-tasks-per-child=25 \
  --max-memory-per-child=1500000   # 1.5 GB RSS then recycle
```

**`document-centre-worker-light.service`** — fast/IO jobs
```
ExecStart=/opt/document-centre-api/.venv/bin/celery -A app.worker.celery_app worker \
  -l info -Q default,thumbnails -n light@%H \
  --concurrency=4 -P prefork \
  --max-tasks-per-child=200 \
  --max-memory-per-child=600000    # 600 MB RSS then recycle
```

Total: 2 heavy + 4 light prefork children = 6 child processes. With API's 3 workers, peak active processes ≈ 9, which is healthy on 4 vCPU (CPU-bound heavy jobs dominate; light jobs are mostly IO/wait).

Memory budget on 16 GB:
- API workers: 3 × ~400 MB ≈ 1.2 GB
- Heavy children: 2 × up to 1.5 GB ≈ 3 GB
- Light children: 4 × up to 600 MB ≈ 2.4 GB
- LibreOffice transient peaks: ~1.5 GB
- Redis + OS + buffer: ~2 GB
- Headroom: ~6 GB

### 3. Celery global tuning in `app/worker.py`

Add to `celery_app.conf.update(...)`:
```
worker_prefetch_multiplier=1,        # don't hoard tasks on heavy worker
task_acks_late=True,                 # re-queue if a child crashes mid-job
task_reject_on_worker_lost=True,
worker_send_task_events=True,        # so PlatformDocumentCentreWorkers UI sees them
task_send_sent_event=True,
broker_pool_limit=20,
result_expires=3600,
```

This is the safety net that makes mid-job LibreOffice/Ghostscript crashes recoverable instead of silently dropping the job.

### 4. Update Docker compose (dev parity)

`pdf-server/docker-compose.yml` — change worker command to `start-worker.sh` plus add a second `worker-light` service mirroring the split, so local behaves like prod. (Optional but recommended.)

### 5. Update env checklists

Add a "Sizing" section to:
- `pdf-server/coolify/WORKER_ENV_CHECKLIST.md`
- `pdf-server/deploy/ubuntu/ENV_CHECKLIST.md`

Documenting: 4 vCPU / 16 GB host, API workers=3, heavy concurrency=2, light concurrency=4, and the memory ceilings.

### 6. Install script

Update `pdf-server/scripts/install-ops-api.sh` (or wherever the existing worker unit is installed) to install both new worker units and remove/disable the old single one. Existing `document-centre-worker.service` file kept but marked deprecated in a comment header so an in-place upgrade can `systemctl disable --now document-centre-worker` then enable the two new units.

### 7. Verify in the Workers UI

After deploy, open `/platform/document-centre/workers` (already implemented in `PlatformDocumentCentreWorkers.tsx`) and confirm:
- Two worker rows appear: `heavy@<host>` and `light@<host>`
- Pool size shows 2 and 4 respectively
- Queue badges match the split

No frontend changes needed — the UI already lists whatever Celery reports.

## Files to change

- `pdf-server/scripts/start-api.sh`
- `pdf-server/deploy/systemd/document-centre-api.service`
- `pdf-server/deploy/systemd/document-centre-worker.service` (deprecate / remove)
- `pdf-server/deploy/systemd/document-centre-worker-heavy.service` (new)
- `pdf-server/deploy/systemd/document-centre-worker-light.service` (new)
- `pdf-server/scripts/start-worker.sh` (split into `start-worker-heavy.sh` + `start-worker-light.sh`)
- `pdf-server/app/worker.py` (global Celery tuning)
- `pdf-server/docker-compose.yml`
- `pdf-server/scripts/install-ops-api.sh` (install new units, disable old)
- `pdf-server/coolify/WORKER_ENV_CHECKLIST.md`
- `pdf-server/deploy/ubuntu/ENV_CHECKLIST.md`

## Manual step you'll need to run on the VPS after I push

```
sudo systemctl daemon-reload
sudo systemctl disable --now document-centre-worker
sudo systemctl enable --now document-centre-worker-heavy
sudo systemctl enable --now document-centre-worker-light
sudo systemctl restart document-centre-api
```

I'll include this in the post-deploy notes.
