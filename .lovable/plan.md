# Phase 1 deploy — current state

## Status

- IAM unblock done: deploy SA has `roles/secretmanager.viewer`. Verify-secrets step passes.
- Earlier Cloud Run startup failure was caused by `requests` missing from `pdf-server/requirements.txt`; `app/web/routes.py` imports `app/tasks/cloudprinter_tasks.py`, which imports `requests`.
- Current failed stage is `Deploy pdf-api (HTTP)`: Cloud Run creates the revision, then reports that the container did not become healthy on `PORT=8080`. Use revision logs for the exact runtime traceback; do not treat the generic PORT message as root cause by itself.

## Fix shipped

- `pdf-server/requirements.txt` — added `requests==2.32.3`.
- `.github/workflows/pdf-server-deploy.yml` — added a container boot smoke test that starts the built image with `ROLE=api`, `PORT=8080`, dummy runtime env, and requires `GET /health` locally before deploy. It prints container logs on failure, catching missing deps, uvicorn worker crashes, static-path issues, and port binding failures before a 5-minute Cloud Run rollout timeout.

## Cloud Run startup log command

Replace the revision name with the failed revision from GitHub Actions:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-api" AND resource.labels.revision_name="pdf-api-00003-8ml"' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=100 \
  --format='value(timestamp,severity,textPayload,jsonPayload.message)'
```

## IAM split (reference)

- **Deploy SA** `github-deployer@…` — `artifactregistry.writer`, `run.admin`, `iam.serviceAccountUser`, `secretmanager.viewer`.
- **Runtime SA** `dc-pdf-runtime@…` — `secretmanager.secretAccessor`, `cloudtasks.enqueuer`, `logging.logWriter`.

## Exit criteria

1. Verify secrets step passes.
2. Build + push succeeds.
3. Container boot smoke test returns `/health` locally on `PORT=8080`.
4. `Deploy pdf-api (HTTP)` succeeds; summary prints the Cloud Run URL.
5. `curl -fsS "$URL/health"` returns 200.