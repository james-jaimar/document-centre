# GCP Cutover — what runs where



## Cloud Run services (auto-scale 0→N)
Sized for a ~200-store target (see `.lovable/plan.md`). `max-instances`
is HEADROOM — Cloud Run only bills running instances.

| Service             | CPU/RAM    | Conc. | min | max | Purpose                                       |
|---------------------|------------|-------|-----|-----|-----------------------------------------------|
| `pdf-api`           | 1 / 1Gi    | 80    | 0   | 10  | FastAPI sync endpoints + `/internal/beat/*`   |
| `pdf-worker-heavy`  | 2 / 4Gi    | 2     | 0   | 5   | LibreOffice/imposition (admin side)           |
| `pdf-worker-light`  | 4 / 4Gi    | 4     | 0   | 50  | Customer-facing preview render (batch GS)     |
| `pdf-worker-emails` | 1 / 512Mi  | 8     | 1   | 10  | SMTP outbound (min=1 → no cold start on email)|

## Cloud Tasks queues (replaces Celery + Redis broker)
- `documents-heavy` → `pdf-worker-heavy` (max-concurrent-dispatches=10)
- `documents-light` → `pdf-worker-light` (max-concurrent-dispatches=200)
- `emails-default`, `emails-control` → `pdf-worker-emails`

Region: **europe-west1** (Tasks/Scheduler not in africa-south1).
Compute region: **africa-south1**.

## Scale-up triggers (set-and-forget)
Only revisit sizing when one of these hits:
- Branch owner reports an upload "sat queued" >30s during business hours
  → bump light `max-instances` 50 → 100.
- Sustained heavy queue depth >5 jobs for >5 min
  → raise heavy `max-instances` 5 → 10 and concurrency 2 → 3.
- Email send latency >10s on a transactional email
  → raise emails `min-instances` 1 → 2.

Each is a single workflow re-run, zero downtime. Configure GCP billing
alerts at £75/mo and £200/mo — if one fires, that's the signal to look.


## Cloud Scheduler jobs (replaces Celery beat)
Created by `pdf-server/docker/gcp-tasks-bootstrap.sh`. All POST to
`pdf-api`/internal/beat/* with OIDC token from `cloud-tasks-invoker`.

| Job                            | Cron        | Endpoint                  |
|--------------------------------|-------------|---------------------------|
| `ops-snapshot-storage-hourly`  | `5 * * * *` | `/snapshot-storage`       |
| `ops-cleanup-tmp-daily`        | `30 3 * * *`| `/cleanup-tmp`            |
| `email-scan-outbox-30s`        | `*/1 * * * *` | `/email-scan-outbox`    |
| `email-release-stuck-5m`       | `*/5 * * * *` | `/email-release-stuck`  |

Scheduler minimum is 1 min; the original 30s Celery cadence is acceptable
because the VPS LISTEN/NOTIFY listener still provides sub-second email push.

## Secret Manager
All runtime secrets pulled by Cloud Run via `secrets-bootstrap.sh`.

## VPS (€5/mo, post-cutover)
**Keep running:**
- `document-centre-listener-emails.service` — Postgres LISTEN/NOTIFY → sub-second SMTP push

**Stop & disable** (once Cloud Scheduler is verified for 24h):
```bash
sudo systemctl disable --now document-centre-beat.service
sudo systemctl disable --now document-centre-worker-heavy.service
sudo systemctl disable --now document-centre-worker-light.service
sudo systemctl disable --now document-centre-worker-emails.service
sudo systemctl disable --now document-centre-api.service
```

## One-time bootstrap
```bash
gcloud auth login
gcloud config set project project-59a14b18-b4df-4c6b-b09
bash pdf-server/docker/gcp-tasks-bootstrap.sh
```
Idempotent — safe to re-run after any new Cloud Run deploy.

## Required env on `pdf-api`
The deploy workflow (`.github/workflows/pdf-server-deploy.yml`) sets these
in two passes:
- Pass 1: `QUEUE_BACKEND=cloud_tasks`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_TASKS_REGION`
- Pass 2 (post-deploy, once URLs are known): `BEAT_SELF_URL`, `TASKS_INVOKER_SA`, `WORKER_URL_{HEAVY,LIGHT,EMAILS}`

The bootstrap script's verification block prints any missing vars.

## Validation checklist
- [ ] `gcloud tasks queues list --location=europe-west1` shows 4 queues
- [ ] `gcloud scheduler jobs list --location=europe-west1` shows 4 jobs
- [ ] Upload PDF in UI → `POST /v1/assets/{id}/inspect` returns 200
- [ ] `pdf-worker-light` logs show inspect task delivered
- [ ] `gcloud scheduler jobs run ops-cleanup-tmp-daily --location=europe-west1` → `pdf-api` log entry
