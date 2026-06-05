## Goal
Get `pdf-api` deploying successfully to Cloud Run after the local Docker smoke test now passes but Cloud Run still fails readiness on `PORT=8080`.

## Diagnosis from current evidence
- The image builds and the GitHub local smoke test reaches `/health`, so the container can boot with dummy env locally.
- Cloud Run fails only during revision startup, which means the remaining difference is the Cloud Run runtime environment or startup timing.
- The deployment currently runs uvicorn with its default `UVICORN_WORKERS=2`, while the smoke test forces `UVICORN_WORKERS=1`. On Cloud Run with `--cpu=1`, multiple uvicorn workers can materially slow or block startup, especially with the heavy PDF stack image.
- The workflow still does not automatically print Cloud Run revision logs after deploy failure, so each failure lacks the real server-side startup logs.

## Implementation plan
1. **Make Cloud Run match the passing smoke test for API startup**
   - Update `.github/workflows/pdf-server-deploy.yml` deploy env vars from:
     - `ROLE=api,LOG_LEVEL=INFO,APP_ENV=production`
   - to include:
     - `UVICORN_WORKERS=1`
     - `PYTHONUNBUFFERED=1`
   - This keeps the API process single-worker on 1 vCPU, matching the known-good boot smoke test and Cloud Run Python best practice.

2. **Add Cloud Run startup log dump on deploy failure**
   - Wrap the `gcloud run deploy pdf-api ...` command so if it fails, the workflow runs:
     - `gcloud logging read` filtered to `service_name="pdf-api"`
     - limit around 100–200 recent entries
     - include timestamp, severity, and message/text payload
   - This means the next failure will show the actual Cloud Run-side traceback/import/startup error in GitHub Actions instead of only the generic Cloud Run readiness message.

3. **Optionally extend Cloud Run startup budget without hiding crashes**
   - Keep `--timeout=300` for request timeout.
   - Add `--startup-probe` only if supported cleanly by the installed `gcloud` version, targeting `/health` on port `8080` with a longer initial tolerance.
   - If `gcloud run deploy --startup-probe` syntax is not stable in this environment, skip this and rely on single-worker startup plus logs.

4. **Update `.lovable/plan.md`**
   - Record the current state: local smoke test passes, Cloud Run readiness fails.
   - Record the runtime-difference fix: Cloud Run now uses one uvicorn worker.
   - Record the new diagnostic behavior: deploy failures print Cloud Run logs automatically.

## Expected next run
- Best case: Cloud Run revision starts, deploy succeeds, and `/health` returns 200.
- If it still fails: GitHub Actions will now include the Cloud Run startup logs needed to identify the exact Python/runtime error.

## Files to change
- `.github/workflows/pdf-server-deploy.yml`
- `.lovable/plan.md`