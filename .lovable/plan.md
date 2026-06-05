## Current blocker

The Cloud Run `pdf-api` revision still fails to listen on `PORT=8080`, but the GitHub Actions workflow cannot show the real Python/startup traceback because the deploy service account is missing `roles/logging.viewer`. The previous run ended with:

```
ERROR: (gcloud.logging.read) PERMISSION_DENIED: Permission denied for all log views.
```

Until that IAM grant is in place, every Cloud Run failure looks the same and the actual root cause stays hidden.

## Required one-time fix (Cloud Shell)

```bash
gcloud projects add-iam-policy-binding project-59a14b18-b4df-4c6b-b09 \
  --member=serviceAccount:github-deployer@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com \
  --role=roles/logging.viewer \
  --condition=None
```

Equivalent shortcuts:
- `bash pdf-server/docker/gcp-setup.sh` (now includes `roles/logging.viewer`).
- `bash pdf-server/docker/secrets-bootstrap.sh --iam-only` (also re-applies `roles/secretmanager.viewer` and `roles/logging.viewer` on the deploy SA).

## Workflow changes shipped

1. `pdf-server/docker/gcp-setup.sh` — adds `roles/logging.viewer` to the deploy SA role list.
2. `pdf-server/docker/secrets-bootstrap.sh` — `--iam-only` mode now also grants project-level `roles/secretmanager.viewer` and `roles/logging.viewer` to the deploy SA.
3. `.github/workflows/pdf-server-deploy.yml`
   - New step "Verify deploy SA can read Cloud Run logs" runs a 1-row `gcloud logging read` and fails fast with the exact grant command if `PERMISSION_DENIED`.
   - Existing post-deploy log dump remains so any future failure prints the actual revision logs.

## What is intentionally NOT being changed yet

- No further uvicorn / Cloud Run / startup-probe tweaks. The local Docker smoke test passes, so the only honest next step is to read the real Cloud Run logs before guessing.
- Already-applied runtime safeguards stay: `UVICORN_WORKERS=1`, `PYTHONUNBUFFERED=1`, `--cpu-boost`, `--timeout=300`.

## Expected next run

- Best case: revision boots, `/health` returns 200, deploy succeeds.
- Otherwise: the GitHub Actions log will contain the actual Cloud Run startup error (import-time exception, missing env, S3 client init, DB URL, etc.), which becomes the next concrete fix.
