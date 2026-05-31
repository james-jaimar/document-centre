# PDF Processing — Horizontal Scaling Roadmap

**Status:** Deferred. Single-VPS setup is adequate for the pilot phase (5–10 PostNet branches). Revisit when paid clients ≥ 5 OR sustained queue depth on `documents` queue > 20 for > 5 min.

**Owner:** James. **Last reviewed:** 2026-05-31.

> When picking this up in future: this file is the single source of truth. Read it top-to-bottom, then start at Phase 1. No need to re-derive anything from chat history.

## Trigger to start work

Any one of:
- 5+ paying branches onboarded.
- Queue backlog alerts firing repeatedly.
- A single upload visibly waits > 60s for preview generation under normal load.
- A second VPS is being considered "just in case".

Until then: **do nothing**. The current setup is fine.

## Current state (as of 2026-05-31)

- 1 VPS hosts: FastAPI API (3 uvicorn workers), Celery heavy worker (2 children, queues: documents/imposition/pdf), Celery light worker (8 children, queues: default/thumbnails), Celery beat, and Redis.
- Sized for 4 vCPU / 16 GB. See `pdf-server/coolify/WORKER_ENV_CHECKLIST.md` for the exact split.
- Redis is local (`redis://127.0.0.1:6379/0`) — this is the blocker for adding more boxes.
- Supabase Postgres + Storage are already external and shared-safe.

## Target architecture

```text
Browser → API VPS (FastAPI, stateless) → Supabase (Postgres + Storage)
                  │
                  ▼ enqueue
         Upstash Redis (managed, TLS)  ◄── single source of truth
                  │
   ┌──────────────┼──────────────┬──────────────┐
   ▼              ▼              ▼              ▼
Worker 1     Worker 2       Worker 3       Worker N
(heavy+lt)   (heavy+lt)     (heavy+lt)     (heavy+lt)
   │              │              │              │
   └──────────────┴──────┬───────┴──────────────┘
                         ▼
                Supabase Storage (S3)
```

Workers are identical, stateless, cattle-not-pets. Adding capacity = clone the Docker image onto a new VPS, point at the same Upstash URL.

## Phased plan

### Phase 1 — Cut Redis loose (the unblocker)
1. Create Upstash Redis DB (region: nearest to VPS host — likely `eu-west-1`; `af-south-1` doesn't exist on Upstash, latency-pick closest).
2. Pick paid tier with TLS + persistence on + eviction off. Free tier's RPS cap will choke Celery polling.
3. Replace `REDIS_URL` / `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` on the current VPS with the Upstash `rediss://` URL.
4. Stop and disable local `redis-server` systemd unit.
5. Smoke: upload a doc end-to-end, confirm preview generates.

Behaviour identical after this — but Redis is no longer tied to one box.

### Phase 2 — Containerise the worker
1. Confirm existing `pdf-server/Dockerfile` still builds (it's referenced by `docker-compose.yml`).
2. Add GitHub Actions workflow: build + push to `ghcr.io/james-jaimar/document-centre-pdf-worker:latest` on push to `main`.
3. Single entrypoint inside the image runs both `start-worker-heavy.sh` and `start-worker-light.sh` (background both, `wait`). One container = one VPS = two Celery processes.
4. Document spec: 4 vCPU / 16 GB / 80 GB SSD per worker box (Hetzner CPX31 baseline).

### Phase 3 — Spin up worker pool
1. Provision 2 worker VPSes (Hetzner CPX31 ≈ €16/mo each).
2. Each: install Docker, pull image, run with shared `.env` (Upstash URL + Supabase creds + service role).
3. Verify in Platform → Workers UI (`src/pages/platform/PlatformDocumentCentreWorkers.tsx`) that `heavy@vps-1`, `light@vps-1`, `heavy@vps-2`, `light@vps-2` all show up.
4. Load-test: 50 concurrent uploads, watch jobs spread.

### Phase 4 — Operational hardening
- Per-tenant API rate limiting via `@upstash/ratelimit` (stops one runaway branch starving the queue).
- Queue-depth alerts via Upstash Prometheus metrics — alert at `documents` depth > 50 for > 2 min.
- Optional autoscaler (Phase 5): poll queue depth, provision Hetzner VPS via API. Manual scaling fine for first 50 branches.

## Important caveats / things-to-remember-for-future-agent

- **Shared PDF cache caveat**: heavy and light workers currently hand prepared PDFs to each other via `/var/cache/document-centre/pdf-cache` on local disk. With workers on different VPSes the cache misses and falls back to S3. Code already handles this — just slightly slower per job. Don't try to "fix" it with a shared NFS mount, not worth it.
- **`PDF_CACHE_ENABLED` env var**: leave true; misses are cheap.
- **`task_acks_late=True` + `task_reject_on_worker_lost=True`** are already set in `pdf-server/app/worker.py` — a worker dying mid-task re-queues the job. Critical for cattle-style workers; don't change it.
- **Celery beat** must run on **exactly one** node. Either keep it on the API VPS or designate one worker VPS as the beat host. Two beats = duplicate scheduled work.
- **`worker_prefetch_multiplier=1`** is already set — keep it so heavy children don't hoard small jobs.
- **Edge functions stay untouched**: `production-pdf`, `enqueue-print-ready` etc. call the API via HTTPS. They don't need to know about workers.
- **Frontend stays untouched**: API URL unchanged. The `pdf-api` proxy hook doesn't care how many workers are behind the API.
- **Queue names**: `documents`, `imposition`, `pdf` (heavy) + `default`, `thumbnails` (light). Don't rename — they're hardcoded in task `@queue(...)` decorators.
- **Migration script exists**: `pdf-server/scripts/migrate-to-split-workers.sh` — useful reference for systemd → split worker pattern, but the new world is Docker not systemd. Keep as historical reference; don't rely on it for the cloud rollout.

## Cost sketch (ZAR, monthly, rough)

- Upstash Redis Pro (10k cmds/sec, 1 GB): ~$10–30 ≈ R200–R600
- API VPS (existing): unchanged
- Worker VPS × 2 (Hetzner CPX31): ~€16 each ≈ R650/mo total
- **Total added: under R1,500/mo** to comfortably support ~5,000 jobs/day. Each extra worker ≈ R325/mo.

## Open decisions (answer when work resumes)

1. Worker hosting provider — Hetzner (cheapest, EU) vs. stay with current provider?
2. Upstash region — Europe (lower cost, ~150ms from SA) vs. US East?
3. Image registry — GHCR (free, integrated) vs. Docker Hub?
4. Auto-build worker image via GitHub Actions on every `main` commit? (Recommended yes.)

## What does NOT change

- Supabase Postgres + Storage.
- API URL — frontend untouched.
- Edge functions.
- Job semantics, queue names, retry logic.
