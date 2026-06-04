# GCP Cloud Run cutover — pdf-server

**Status:** Phase 1 in progress.
**Region:** `africa-south1` (Johannesburg).
**Runtime config:** GCP Secret Manager (no values in GitHub).
**Email listener:** stays on the VPS.
**Redis:** none. Target broker is Cloud Tasks (introduced in Phase 2).

## Target architecture

```text
Frontend / Edge Functions
        │  HTTPS
        ▼
┌──────────────────────── GCP Cloud Run (africa-south1) ────────┐
│  pdf-api         FastAPI sync endpoints  ◄── Phase 1 (now)    │
│  pdf-worker      HTTP endpoints invoked by Cloud Tasks        │
│  email-sender    SMTP outbound, invoked by Cloud Tasks        │
└───────────────▲───────────────────────────▲───────────────────┘
                │                           │
        Cloud Tasks (queues)        Cloud Scheduler (cron)
                ▲
                │
   ┌────────────┴────────────┐
   │  Supabase Postgres      │  ◄── reused; no Cloud SQL
   │  Supabase Storage / S3  │
   └─────────────────────────┘

Tiny VPS (kept):
  └─ email-listener   (Postgres LISTEN/NOTIFY → enqueue)
  └─ celery beat      (until Phase 4)
  └─ celery workers   (until Phase 3)
```

## Phase 1 — Get pdf-api green on Cloud Run (this week)

### Code changes (done in this commit)
1. `pdf-server/app/core/config.py` — `REDIS_URL` / `CELERY_BROKER_URL` /
   `CELERY_RESULT_BACKEND` now default to `memory://` so the API container
   boots on Cloud Run without Redis. Celery is constructed lazily; the API
   never opens a socket to a broker.
2. `.github/workflows/pdf-server-deploy.yml` rewritten:
   - Deploys **only** `pdf-api` (worker services removed for Phase 1).
   - Runtime env mounted via `--set-secrets` from Secret Manager.
   - Required-secrets check now reads Secret Manager (not GitHub Secrets).
   - Optional secrets (AWS / admin creds) are auto-skipped if absent.
3. `pdf-server/docker/secrets-bootstrap.sh` — interactive one-time script
   that creates the Secret Manager entries and grants the runtime SA access.

### Manual steps for you (in order)
1. In **Cloud Shell** (`https://shell.cloud.google.com`) with project
   `project-59a14b18-b4df-4c6b-b09` selected:
   ```bash
   git clone https://github.com/james-jaimar/document-centre.git
   cd document-centre
   bash pdf-server/docker/secrets-bootstrap.sh
   ```
   When prompted, paste values for the required secrets. **`PDF_DATABASE_URL`
   must use the Supabase transaction-mode pooler (port 6543)** — Cloud Run
   instances are ephemeral and will exhaust direct connections.
2. Push to `main` (or click **Run workflow** on the action) — it builds,
   pushes the image, and deploys `pdf-api`. The job summary prints the
   Cloud Run URL.
3. Smoke test:
   ```bash
   curl -fsS "$URL/health"
   ```
4. Update the `DOCUMENT_CENTRE_API_URL` secret on the `pdf-api` Supabase
   Edge Function to point at the new Cloud Run URL. Edge functions and
   frontend code stay identical.
5. Leave the VPS running in parallel — nothing is decommissioned yet.

### Exit criteria
- Cloud Run `pdf-api` healthy.
- Edge functions can be flipped to it without behavioural changes.
- VPS still authoritative for all Celery work + email listener.

## Phase 2 — Cloud Tasks dispatcher (next)
- Add `app/dispatch/cloud_tasks.py` wrapper: `dispatcher.enqueue(name, payload, queue)`.
- Stand up `pdf-worker` Cloud Run service exposing `POST /tasks/{name}`.
- Feature flag `DISPATCHER_BACKEND=celery|cloud_tasks` per call site.
- Provision Cloud Tasks queues: `documents`, `imposition`, `pdf`, `thumbnails`, `default`, `emails-default`.

## Phase 3 — Per-task migration (lowest-risk first)
1. `thumbnails` → 2. preflight → 3. pikepdf/pypdf → 4. `email-sender`
→ 5. LibreOffice conversion → 6. imposition / print-ready (60-min Cloud
Run timeout, 4 GB / 2 vCPU).

When zero `@celery.task` decorators remain, stop VPS Celery workers.

## Phase 4 — Cloud Scheduler replaces beat
Cron jobs:
- `ops.snapshot_storage` (hourly)
- `ops.cleanup_tmp` (daily 03:30)
- `email.scan_outbox` (every minute — safety net; LISTEN/NOTIFY primary)
- `email.release_stuck` (every 5 min)

Each is an authenticated HTTP POST to `pdf-worker`.

## Phase 5 — Downsize VPS
Only `email-listener` remains on it. Migrate to Hetzner CX11 (1 vCPU /
2 GB, €5/mo) or smallest equivalent.

## Reference

| Resource | Value |
|---|---|
| GCP project ID | `project-59a14b18-b4df-4c6b-b09` |
| Project # | `622687766375` |
| Region | `africa-south1` |
| Artifact Registry repo | `dc-pdf` |
| Deploy SA | `github-deployer@…iam.gserviceaccount.com` |
| Runtime SA | `dc-pdf-runtime@…iam.gserviceaccount.com` |
| WIF provider | `projects/622687766375/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |

## Notes / gotchas

- **Pooler port 6543**: required for Supabase Postgres from Cloud Run.
  Session-mode pooler (5432) will exhaust the connection slot pool.
- **Cloud Run filesystem is read-only** except `/tmp` — `pdf_cache_dir`
  defaults to `/var/cache/document-centre/pdf-cache`; workers running on
  Cloud Run (Phase 3) will need this overridden to `/tmp/pdf-cache`.
- **No Redis anywhere** in the target state. Cloud Tasks is the broker.
  Phase 1 ships `memory://` defaults purely so import doesn't fail.
