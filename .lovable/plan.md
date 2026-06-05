# Fix: deploy workflow can't see the Secret Manager entries

## Root cause

The "Missing Secret Manager entries" error is misleading. The secrets **do exist** — you confirmed they were created. The check fails because `gcloud secrets describe` requires the **caller** (the deploy SA, `github-deployer@…`) to have read permission on each secret.

`secrets-bootstrap.sh` only grants `roles/secretmanager.secretAccessor` to the **runtime SA** (`dc-pdf-runtime@…`), which is correct for Cloud Run to mount the secrets at runtime — but the deploy SA was never granted anything, so it can't even see they exist. From its perspective they all look missing.

The same problem will hit the `--set-secrets` step's optional-secret probe immediately after, so we need to fix it before the workflow can succeed.

## Fix

### 1. One-time IAM grant (you, in Cloud Shell — ~10 seconds)

Grant the deploy SA project-wide read access to Secret Manager metadata + values it needs to mount:

```bash
gcloud projects add-iam-policy-binding project-59a14b18-b4df-4c6b-b09 \
  --member="serviceAccount:github-deployer@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com" \
  --role="roles/secretmanager.viewer"
```

`viewer` is enough for `describe` (the check) and for Cloud Run's `--set-secrets` to validate the reference at deploy time. The runtime SA keeps its narrower `secretAccessor` binding so it can actually read the values when the container boots.

### 2. Update `secrets-bootstrap.sh` so this doesn't recur

Add the deploy SA grant to the bootstrap script's per-secret IAM block, alongside the existing runtime SA grant:

```bash
# existing:
gcloud secrets add-iam-policy-binding "$name" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" ...

# add:
gcloud secrets add-iam-policy-binding "$name" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/secretmanager.viewer" ...
```

Plus a `DEPLOY_SA="${DEPLOY_SA:-github-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"` at the top. Idempotent — safe to re-run.

### 3. Improve the workflow error message

Change the "verify required Secret Manager entries" step so a permission failure is distinguishable from a genuinely missing secret. Today it lumps both into "missing". New behaviour:

- If `gcloud secrets describe` fails, capture stderr.
- If stderr contains `PERMISSION_DENIED`, print a clear hint: *"Deploy SA lacks secretmanager.viewer — run the grant from `pdf-server/docker/secrets-bootstrap.sh` or the README."*
- Otherwise treat as missing as today.

### 4. (Optional, same PR) Bump Node 20 actions warning

GitHub deprecation notice in the run is informational only — `actions/checkout@v4`, `google-github-actions/auth@v2`, `setup-gcloud@v2` are all current major versions and the maintainers will ship Node 24 builds before the September 2026 deadline. **No code change needed now.** Mentioning only so you know it's not contributing to the failure.

## Files changed

- `pdf-server/docker/secrets-bootstrap.sh` — add `DEPLOY_SA` var + second `add-iam-policy-binding` per secret.
- `.github/workflows/pdf-server-deploy.yml` — improve the verify step's error reporting.
- `.lovable/plan.md` — note the IAM split (runtime SA = accessor, deploy SA = viewer) in the Phase 1 reference table.

No application code or config defaults change.

## Order of operations

1. You run the `gcloud projects add-iam-policy-binding …` command above in Cloud Shell.
2. I make the three file edits.
3. You re-run the workflow (or push, since this commit will touch `pdf-server/**`).
4. Verify step passes, image builds, `pdf-api` deploys, job summary shows the Cloud Run URL.

## Exit criteria

- Workflow run reaches the "Deploy pdf-api" step and succeeds.
- `gcloud run services describe pdf-api --region=africa-south1` returns a healthy URL.
- `curl -fsS "$URL/health"` returns 200.
