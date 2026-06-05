# Phase 1 deploy — current state

## Status

- IAM unblock done.
- `requests` dependency added (previous import-time crash).
- Latest failure is in the local **Container boot smoke test**: container starts, prints `[entrypoint] starting role=api port=8080`, then curl gets `Connection reset by peer` and the container exits before `/health` answers.
- We do not yet have the real Python traceback, so we are not guessing root cause. The smoke test now needs to print logs reliably.

## Fix shipped this iteration

`.github/workflows/pdf-server-deploy.yml` — smoke test hardened:
- `UVICORN_WORKERS=1` so a worker crash surfaces in main process logs instead of being swallowed by the prefork supervisor.
- `LOG_LEVEL=debug`, `PYTHONUNBUFFERED=1`, `APP_DEBUG=true`.
- Adds `SECRET_KEY` and `CORS_ORIGINS` dummy env so settings validation never blocks startup.
- `dump_logs()` always runs via `trap EXIT`, prints a clearly-delimited block, and the exit-code branch also prints `docker inspect .State.ExitCode`.
- Health-probe redirects curl stderr so the only error you see in the workflow log is the real container traceback.

## Next run — what to look for

The "Container boot smoke test" step output will contain a block:

```
===== docker logs (pdf-api smoke) =====
... full uvicorn/Python output ...
===== end docker logs =====
```

That block is the source of truth. Paste it back if it still fails — only then do we patch the underlying crash.

## Cloud Run startup log command (still useful if a revision boots in CR but fails health)

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-api"' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=200 \
  --format='value(timestamp,severity,textPayload,jsonPayload.message)'
```

## IAM split (reference)

- **Deploy SA** `github-deployer@…` — `artifactregistry.writer`, `run.admin`, `iam.serviceAccountUser`, `secretmanager.viewer`.
- **Runtime SA** `dc-pdf-runtime@…` — `secretmanager.secretAccessor`, `cloudtasks.enqueuer`, `logging.logWriter`.

## Exit criteria

1. Verify secrets step passes.
2. Build + push succeeds.
3. Container boot smoke test returns `/health` locally on `PORT=8080` (or prints a real traceback we can act on).
4. `Deploy pdf-api (HTTP)` succeeds; summary prints the Cloud Run URL.
5. `curl -fsS "$URL/health"` returns 200.
