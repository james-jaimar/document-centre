# Phase 1 deploy — current state

## Status

- IAM unblock done: deploy SA has `roles/secretmanager.viewer`. Verify-secrets step passes.
- Cloud Run revision was failing to start on `PORT=8080` because `app/web/routes.py` imports `app/tasks/cloudprinter_tasks.py`, which `import requests` — and `requests` was missing from `pdf-server/requirements.txt`. That crashed uvicorn before it could bind.

## Fix shipped

- `pdf-server/requirements.txt` — added `requests==2.32.3`.
- `.github/workflows/pdf-server-deploy.yml` — added an "Import smoke test" step that runs `python -c "import app.main"` inside the freshly built image with dummy env vars. Catches missing-dep / import-time crashes in ~10s instead of waiting ~5 min for Cloud Run revision creation to time out.

## IAM split (reference)

- **Deploy SA** `github-deployer@…` — `artifactregistry.writer`, `run.admin`, `iam.serviceAccountUser`, `secretmanager.viewer`.
- **Runtime SA** `dc-pdf-runtime@…` — `secretmanager.secretAccessor`, `cloudtasks.enqueuer`, `logging.logWriter`.

## Exit criteria

1. Verify secrets step passes.
2. Build + push succeeds.
3. Import smoke test passes.
4. `Deploy pdf-api (HTTP)` succeeds; summary prints the Cloud Run URL.
5. `curl -fsS "$URL/health"` returns 200.
