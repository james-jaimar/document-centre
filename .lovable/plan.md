## Plan

1. **Fix the immediate diagnostic blocker**
   - Update `pdf-server/docker/gcp-setup.sh` so the GitHub deploy service account gets `roles/logging.viewer` in addition to its existing deploy roles.
   - Update `pdf-server/docker/secrets-bootstrap.sh --iam-only` so it can also re-apply the missing project-level IAM needed for diagnostics, not just Secret Manager bindings.
   - Update the workflow’s deploy-failure block to handle `gcloud logging read` permission denial cleanly and print the exact Cloud Shell command to grant the role:
     ```bash
     gcloud projects add-iam-policy-binding project-59a14b18-b4df-4c6b-b09 \
       --member=serviceAccount:github-deployer@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com \
       --role=roles/logging.viewer \
       --condition=None
     ```

2. **Add a pre-deploy logging permission check**
   - Before deployment, run a small `gcloud logging read --limit=1` check.
   - If it fails with `PERMISSION_DENIED`, fail early with the grant command above.
   - This avoids waiting through a full Cloud Run rollout just to discover that the workflow still cannot print the real startup logs.

3. **Keep runtime changes minimal until logs are visible**
   - Do not guess at the Cloud Run startup root cause yet: the current failure only proves the container is not listening on `PORT=8080` in Cloud Run, and the revision logs are currently blocked by IAM.
   - Keep the already-added `UVICORN_WORKERS=1`, `PYTHONUNBUFFERED=1`, and `--cpu-boost` settings.
   - Do not add more startup-time workarounds until the Cloud Run logs show whether this is import-time Python failure, secret/env parsing, S3 client initialization, database URL issue, or pure slow startup.

4. **Document the new next step**
   - Update `.lovable/plan.md` to record that the current blocker is missing `roles/logging.viewer` on the deploy service account.
   - Add the required Cloud Shell command and the expected next run behavior: either deployment succeeds, or the GitHub Actions log finally includes the Cloud Run traceback needed for the real fix.

## Expected result

After this change and one IAM grant, the next GitHub Actions run should no longer end with `PERMISSION_DENIED: Permission denied for all log views`. If Cloud Run still fails startup, the workflow should print the actual revision logs so we can fix the real container startup error instead of guessing.