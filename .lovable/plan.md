# Phase 1 deploy — current state

## Status

- IAM unblock done.
- `requests` dependency added.
- Latest failure was a **false positive** in the smoke test: the liveness check used `docker ps --format '{{.ID}}' | grep "^$cid"`, but `docker run -d` returns the full ID while `docker ps` prints the short form, so the grep never matched and the workflow killed a healthy still-starting container with `Exit code: 0` and no traceback.

## Fix shipped this iteration

`.github/workflows/pdf-server-deploy.yml` — smoke test liveness check rewritten:
- Use `docker inspect -f '{{.State.Running}}'` instead of `docker ps | grep`.
- On true exit, print `.State.Status` + `.State.ExitCode` in one line.
- `dump_logs()` trap unchanged — full container logs always print at the end.

## Next run — what to expect

- If the container is healthy, `/health OK` prints within ~6 s and the deploy proceeds.
- If it truly crashes, the docker-logs block now contains the real uvicorn/Python traceback. Paste that back and we patch the underlying crash.

## Cloud Run startup log command (post-deploy diagnosis)

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
3. Container boot smoke test returns `/health` locally on `PORT=8080` (or prints a real traceback).
4. `Deploy pdf-api (HTTP)` succeeds; summary prints the Cloud Run URL.
5. `curl -fsS "$URL/health"` returns 200.
