## Plan

The latest failure is caused by the GitHub Actions smoke test, not by a proven FastAPI crash.

The check currently does this:

```bash
cid=$(docker run -d ...)
docker ps --format '{{.ID}}' | grep -q "^$cid"
```

`docker run -d` returns the full container ID, while `docker ps --format '{{.ID}}'` returns the shortened ID. That makes the grep fail immediately, so the workflow falsely reports:

```text
Container exited before /health became ready
Exit code: 0
```

The container is likely still starting when the workflow kills it in cleanup, which explains why logs only show:

```text
[entrypoint] starting role=api port=8080
```

## Changes to make

1. Update `.github/workflows/pdf-server-deploy.yml`
   - Replace the brittle `docker ps | grep` liveness check with `docker inspect -f '{{.State.Running}}' "$cid"`.
   - Print `.State.Status`, `.State.Running`, and `.State.ExitCode` only when the container is genuinely not running.
   - Keep the existing `/health` loop and docker-log dump.

2. Update `.lovable/plan.md`
   - Record this as a smoke-test bug: truncated Docker IDs caused a false early failure.
   - Update the next-run expectation: the smoke test should now wait up to 90 seconds for `/health`, or print a real traceback only if the container actually exits.

## Validation

- Check the workflow syntax markers after editing.
- The next GitHub Actions run should either:
  - pass `/health OK`, then deploy Cloud Run, or
  - if the app truly crashes, show real uvicorn/Python logs instead of the current false `Exit code: 0` message.