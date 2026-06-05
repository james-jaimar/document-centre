## Plan

1. **Get the real Cloud Run startup error**
   - Use the revision shown in the failure: `pdf-api-00003-8ml`.
   - Ask you to run one focused `gcloud logging read` command, or paste the first traceback/error lines from the Logs URL.
   - Do not assume the cause from the generic `PORT=8080` message.

2. **Verify whether the new import smoke test actually ran and passed**
   - Check the GitHub Actions log for **Import smoke test (catch missing deps before Cloud Run rollout)**.
   - If it passed, the app imports successfully but still fails during actual uvicorn startup/runtime initialisation.
   - If it failed, fix that dependency/import error first.

3. **Improve the deploy workflow smoke test to match Cloud Run startup**
   - Replace or extend the current import-only smoke test with a container boot test:
     - run the built image with `ROLE=api` and `PORT=8080`
     - wait for `http://127.0.0.1:8080/health`
     - print container logs on failure
   - This catches port binding, uvicorn worker, static path, missing runtime env, and startup crashes before deploying to Cloud Run.

4. **Fix the actual startup crash from the logs**
   - Based on the Cloud Run traceback/container logs, patch the smallest failing area only.
   - Likely candidates to inspect after logs: uvicorn worker startup, static directory mounting, env/secrets values, DB/storage initialisation at import/startup, or another missing Python/system dependency.

5. **Update `.lovable/plan.md` with the new failure stage and runbook**
   - Record that the failure is now Cloud Run revision startup after image build/push.
   - Add the exact log command and expected validation path.

## Command for you to get the decisive log

Run this in Cloud Shell or locally with gcloud authenticated:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-api" AND resource.labels.revision_name="pdf-api-00003-8ml"' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=100 \
  --format='value(timestamp,severity,textPayload,jsonPayload.message)'
```

Paste the output here. The generic GitHub error only says the container did not become healthy; the Cloud Run revision logs should show the real Python/container error.