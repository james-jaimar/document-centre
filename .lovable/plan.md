## Diagnosis

The GitHub Action is reaching Cloud Run deployment successfully, so WIF, image push, and deploy permissions are working. The failing point is container startup.

Two code/config issues stand out:

1. **Cloud Run expects the API to listen on `PORT=8080`**, and the entrypoint honours `$PORT`, but the Dockerfile still documents/exposes `8000`. This is confusing and can cause drift.
2. **`app.core.config.Settings` requires `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` at import time.** `app.main` imports settings before the server starts. The GitHub Action deploys `pdf-api` with only `ROLE=api,LOG_LEVEL=INFO`, so the FastAPI process likely exits immediately before it can bind to port 8080.

## Plan

1. **Make the API image Cloud Run-port aligned**
   - Update the Dockerfile defaults from `API_PORT=8000` / `EXPOSE 8000` to `API_PORT=8080` / `EXPOSE 8080`.
   - Keep the entrypoint behaviour of using Cloud Run’s `$PORT` first.

2. **Add required runtime environment variables to the Cloud Run deploy commands**
   - Update `.github/workflows/pdf-server-deploy.yml` so `pdf-api`, `pdf-worker-heavy`, and `pdf-worker-light` receive required runtime env vars from GitHub Actions secrets.
   - Minimum required secrets:
     - `DATABASE_URL`
     - `REDIS_URL`
     - `CELERY_BROKER_URL`
     - `CELERY_RESULT_BACKEND`
     - plus Supabase/storage secrets if the deployed API needs real document operations immediately.

3. **Add a fail-fast workflow validation step**
   - Before build/deploy, check required secrets are present.
   - If missing, fail with a clear message like `Missing required GitHub secret: DATABASE_URL` instead of waiting for Cloud Run startup failure.

4. **Recommended manual follow-up**
   - In GitHub repo settings, add the required secrets under **Settings → Secrets and variables → Actions**.
   - Re-run the workflow.
   - If it still fails, open the Cloud Run Logs URL for the revision and paste the first Python traceback; at that point the port/env issue will be ruled out and we can target the next concrete error.