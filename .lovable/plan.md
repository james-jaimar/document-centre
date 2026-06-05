You're right — the original plan was Cloud Tasks + Cloud Scheduler so we never need Redis or Memorystore. I dropped that thread when I started reasoning from the existing Celery code. Let's put it back on the rails.

This plan has two halves: (A) the custom domain one-pager you asked for, and (B) the actual GCP-native workers migration that was promised.

---

## A. Custom domain one-pager: `api.document-centre.com`

A standalone markdown doc at `pdf-server/docker/CUSTOM_DOMAIN.md` with these steps:

1. **GCP Console → Cloud Run → Manage Custom Domains → Add Mapping**
   - Service: `pdf-api`
   - Domain: `api.document-centre.com`
   - Region: `europe-west1` (matches the deployed service)
2. **Verify domain ownership** (one-time, via Search Console TXT record on `document-centre.com` — already verified if you've done Amplify before; if not, GCP shows the exact TXT to add).
3. **DNS at your registrar** — add the CNAME GCP gives you:
   ```
   api    CNAME    ghs.googlehosted.com.
   ```
4. **Wait** ~5–15 min for cert provisioning (status goes `Pending` → `Active` in the Cloud Run UI).
5. **Smoke test:** `curl https://api.document-centre.com/health` → 200.
6. **Flip the Supabase secret** `DOCUMENT_CENTRE_API_URL` from the raw `*.run.app` URL to `https://api.document-centre.com`.
7. **Re-run** the `pdf-api` edge function smoke test to confirm.

Includes a troubleshooting block (cert stuck Pending = DNS not propagated; 404 = mapping in wrong region).

---

## B. GCP-native workers migration (no Redis, no VPS for queues)

The architecture you were promised:

```text
Cloud Run services (scale 0→N):
  ├─ pdf-api            FastAPI HTTP (already deployed)
  ├─ pdf-worker-heavy   HTTP worker — imposition, large PDF assembly
  ├─ pdf-worker-light   HTTP worker — thumbnails, preflight, conversions
  └─ pdf-worker-emails  HTTP worker — SMTP send

Cloud Tasks queues (replace Celery broker):
  ├─ documents-heavy    → pushes to pdf-worker-heavy
  ├─ documents-light    → pushes to pdf-worker-light
  ├─ emails-default     → pushes to pdf-worker-emails
  └─ emails-control     → pushes to pdf-worker-emails (scan_outbox, release_stuck)

Cloud Scheduler (replaces Celery beat):
  ├─ ops-snapshot-storage-hourly  → POST pdf-api /internal/beat/snapshot-storage
  ├─ ops-cleanup-tmp-daily        → POST pdf-api /internal/beat/cleanup-tmp
  ├─ email-scan-outbox-30s        → enqueues a Cloud Task on emails-control
  └─ email-release-stuck-5m       → enqueues a Cloud Task on emails-control

GCP Secret Manager: all env (PDF_DATABASE_URL, S3 creds, SMTP, etc.)

VPS (€5/mo, optional, Phase 2):
  └─ Email LISTEN/NOTIFY listener  (push path; Scheduler 30s is the safety net)
```

Beat is gone. Redis is gone. Celery the library stays only as code we delete in Phase 2; the *runtime* is Cloud Tasks HTTP push.

### Changes required in the repo

1. **New HTTP worker entrypoints** in `pdf-server/app/web/`:
   - `tasks_routes.py` exposing `/internal/tasks/{task_name}` — receives a Cloud Tasks HTTP push, verifies the OIDC token (Cloud Tasks signs the request with a service account), dispatches to the existing task function bodies.
   - `beat_routes.py` exposing `/internal/beat/{job_name}` — same OIDC verification, runs the scheduled job inline.
   - Both routers gated by `ROLE` so only worker services mount them.

2. **Task dispatch abstraction** in `pdf-server/app/core/queue.py`:
   - `enqueue(task_name, payload, queue)` — in GCP mode, calls Cloud Tasks `CreateTask` with an `HttpRequest` targeting the right worker URL; in legacy/local mode, calls the existing Celery `apply_async`.
   - Selected by `QUEUE_BACKEND=cloud_tasks|celery` env var so we can ship without breaking the VPS.

3. **Update task callers** — every `xyz.delay(...)` / `xyz.apply_async(...)` becomes `enqueue("xyz", {...}, queue="...")`. Mechanical change, grep-driven.

4. **Entrypoint roles** in `pdf-server/scripts/entrypoint.sh`:
   - Add `worker-heavy-http`, `worker-light-http`, `worker-emails-http` that all run `uvicorn app.main:app` but with `ROLE` set so only the relevant `/internal/tasks/*` handlers are active. (One image, three services, just like today.)
   - Keep the existing Celery roles for the VPS during cutover.

5. **GitHub Actions deploy workflow** (`.github/workflows/pdf-server-deploy.yml`):
   - After `pdf-api` deploy, also deploy `pdf-worker-heavy`, `pdf-worker-light`, `pdf-worker-emails` from the same image with different `ROLE` env.
   - Concurrency/min-instances tuned per service (heavy: cpu=2, mem=4Gi, min=0, max=5; light: cpu=1, mem=1Gi, min=0, max=20; emails: cpu=1, mem=512Mi, min=0, max=10).

6. **Infra bootstrap script** `pdf-server/docker/gcp-tasks-bootstrap.sh`:
   - Creates the four Cloud Tasks queues with sane retry/rate config.
   - Creates a `cloud-tasks-invoker` service account with `roles/run.invoker` on each worker service.
   - Creates the four Cloud Scheduler jobs pointing at `pdf-api` beat endpoints and the emails-control queue.
   - Idempotent (safe to re-run).

7. **Listener decision (Phase 2, not now):**
   - Phase 1 ships everything above and the 30s Scheduler push fires `scan_outbox` reliably enough that we don't need the listener for cutover.
   - Phase 2 (optional): tiny €5 VPS or a Cloud Run service with `min-instances=1` running `app.email.listener` for sub-second email push.

### Out of scope for this plan
- Actually performing the GCP console clicks for domain mapping (one-pager guides you).
- Removing the Celery code (kept as fallback until Cloud Tasks path is proven in prod).
- Migrating storage/Postgres — already on Supabase, untouched.

### What you do vs what I do
- **I do:** all code changes (1–6), the one-pager, the bootstrap script.
- **You do:** run `gcp-tasks-bootstrap.sh` once, click through the domain mapping using the one-pager, paste the new domain into the Supabase secret.

Sound right? Approve and I'll build A and B in one pass.