# Plan: GCP-native pdf-server (Phase 2 shipped)

## What landed in this pass

### A. Custom domain one-pager
- `pdf-server/docker/CUSTOM_DOMAIN.md` — step-by-step for mapping
  `api.document-centre.com` → Cloud Run `pdf-api` in `africa-south1`,
  with CNAME, smoke test, secret flip, and troubleshooting.

### B. GCP-native workers infrastructure
- `pdf-server/app/core/queue.py` — `enqueue(name, *args, queue=..., **kw)`
  switches on `QUEUE_BACKEND={celery|cloud_tasks}`. Cloud Tasks path uses
  the `cloud-tasks-invoker` SA to push OIDC-signed HTTP requests at the
  right worker URL.
- `pdf-server/app/tasks/registry.py` — single `TASK_REGISTRY` mapping task
  name → callable, shared by the queue dispatcher and the HTTP worker.
- `pdf-server/app/web/tasks_routes.py` — `POST /internal/tasks/{name}`,
  OIDC-verified, runs the registered task. Mounted only when
  `ROLE in {worker-{heavy,light,emails}-http}`.
- `pdf-server/app/web/beat_routes.py` — `POST /internal/beat/{job}` for
  Cloud Scheduler (`snapshot-storage`, `cleanup-tmp`,
  `email-scan-outbox`, `email-release-stuck`). Mounted on `pdf-api`.
- `pdf-server/scripts/entrypoint.sh` — adds `worker-heavy-http`,
  `worker-light-http`, `worker-emails-http` roles (uvicorn). Legacy
  Celery roles kept for VPS fallback.
- `pdf-server/app/main.py` — ROLE-gated router mounting.
- `pdf-server/requirements.txt` — adds `google-cloud-tasks`, `google-auth`
  (lazy-imported, doesn't affect Celery-mode boot).
- `pdf-server/docker/gcp-tasks-bootstrap.sh` — idempotent: enables APIs,
  creates `cloud-tasks-invoker` SA, four Cloud Tasks queues with tuned
  retry/rate, grants `roles/run.invoker`, creates the four Scheduler jobs.
- `.github/workflows/pdf-server-deploy.yml` — after `pdf-api`, deploys
  `pdf-worker-heavy/light/emails` from the same image with the right ROLE
  and a two-pass `WORKER_SELF_URL` so OIDC audience matches. Sets
  `BEAT_SELF_URL` on `pdf-api`.

## Architecture

```text
Cloud Run (scale 0→N, all in africa-south1):
  pdf-api              FastAPI public + /internal/beat/*
  pdf-worker-heavy     /internal/tasks/*  (documents, imposition, pdf)
  pdf-worker-light     /internal/tasks/*  (default, thumbnails)
  pdf-worker-emails    /internal/tasks/*  (emails-default, emails-control)

Cloud Tasks queues (no Redis, no Memorystore):
  documents-heavy → pdf-worker-heavy
  documents-light → pdf-worker-light
  emails-default  → pdf-worker-emails
  emails-control  → pdf-worker-emails

Cloud Scheduler (replaces Celery beat):
  ops-snapshot-storage-hourly → pdf-api /internal/beat/snapshot-storage
  ops-cleanup-tmp-daily       → pdf-api /internal/beat/cleanup-tmp
  email-scan-outbox-30s       → pdf-api /internal/beat/email-scan-outbox
  email-release-stuck-5m      → pdf-api /internal/beat/email-release-stuck

VPS (optional, Phase 2.5):
  listener-emails — Postgres LISTEN/NOTIFY for sub-second email push.
  Cloud Scheduler 1-min scan is the safety net if you keep it on VPS or
  drop it entirely.
```

## Manual steps you need to take (in this order)

1. **Push to main** so the workflow deploys the three new worker services.
2. **Cloud Shell**: `bash pdf-server/docker/gcp-tasks-bootstrap.sh`
3. **Custom domain**: follow `pdf-server/docker/CUSTOM_DOMAIN.md`, then
   update Supabase secret `DOCUMENT_CENTRE_API_URL`.
4. **Flip QUEUE_BACKEND to cloud_tasks** on pdf-api (Cloud Run env var)
   *after* the call-site rewrite in Phase 2.1 (below).

## Phase 2.1 (next pass — call-site rewrite)

Every `task.delay(...)` / `task.apply_async(...)` in `app/web/routes.py`,
`app/email/listener.py`, `app/tasks/email_tasks.py`,
`app/tasks/document_tasks.py`, `app/tasks/operation_tasks.py` needs to
become `enqueue("task_name", *args, queue="...", **kwargs)`. ~25 sites,
mechanical, deferred so this PR stays reviewable. Until that lands,
`QUEUE_BACKEND` stays on `celery` and the infra above is dormant.

## What's intentionally NOT removed

- The Celery app, beat config, and VPS systemd units stay until Phase 5,
  so we can fall back at any time by flipping `QUEUE_BACKEND` back.
