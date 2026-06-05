# Phase 1 deploy — current state

## Status

- GCP IAM unblock applied manually: `github-deployer@…` now has `roles/secretmanager.viewer` on the project. The "PERMISSION_DENIED" failure is resolved at the GCP level.
- Repo changes below make this self-healing so a fresh setup or a new secret added later won't reintroduce the same failure.

## IAM split (reference)

- **Deploy SA** `github-deployer@…` — `roles/artifactregistry.writer`, `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/secretmanager.viewer`. Used by GitHub Actions to build, push, deploy, and validate `--set-secrets` refs.
- **Runtime SA** `dc-pdf-runtime@…` — `roles/secretmanager.secretAccessor`, `roles/cloudtasks.enqueuer`, `roles/logging.logWriter`. Used by Cloud Run at container boot to read secret values.

## Repo changes shipped

- `pdf-server/docker/gcp-setup.sh` — deploy SA now also gets `roles/secretmanager.viewer` during one-shot bootstrap.
- `pdf-server/docker/secrets-bootstrap.sh` — added `--iam-only` mode so IAM can be re-applied to existing secrets without re-entering values.
- `.github/workflows/pdf-server-deploy.yml` — PERMISSION_DENIED error now points to the three concrete fixes (script `--iam-only`, full gcp-setup, or the one-liner). Added `defaults.run.shell: bash`.

## Exit criteria

1. Re-run of the workflow passes the "Verify required Secret Manager entries exist" step.
2. Build + push of the image succeeds.
3. `Deploy pdf-api (HTTP)` succeeds; job summary shows the Cloud Run URL.
4. `curl -fsS "$URL/health"` returns 200.
