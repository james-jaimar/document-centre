Do I know what the issue is? Yes, enough to plan the fix.

What is happening:
- The file upload itself is succeeding: `POST /v1/assets` returns `200 OK`.
- The failure is the next step: `POST /v1/assets/{asset_id}/inspect` returns `500`.
- That endpoint calls `enqueue("inspect_asset", ...)` in `pdf-server/app/web/routes.py`, which now enters the Google Cloud Tasks path in `pdf-server/app/core/queue.py`.
- The new traceback starts inside `google/api_core/grpc_helpers.py`, so this is no longer the old Celery/Kombu failure. It is Cloud Tasks task creation failing.
- The current bootstrap grants `roles/iam.serviceAccountTokenCreator` on `cloud-tasks-invoker` to `dc-pdf-runtime`, but the error class we have been chasing (`iam.serviceAccounts.actAs`) requires `roles/iam.serviceAccountUser` on the OIDC service account used in the task. TokenCreator is not the same permission.

Plan:
1. Fix the GCP bootstrap IAM grant
   - Update `pdf-server/docker/gcp-tasks-bootstrap.sh` to grant `roles/iam.serviceAccountUser` on `cloud-tasks-invoker@...` to the actual runtime service account for `pdf-api`.
   - Keep the existing TokenCreator grant only if useful, but make `serviceAccountUser` the required grant for Cloud Tasks OIDC enqueue.
   - Add a clear verification line so the script prints the exact runtime service account it resolved.

2. Add a deployment guard
   - Update the GitHub workflow notes/summary so this IAM grant is explicit in the Cloud Tasks setup instructions.
   - This prevents future redeploys from reintroducing the same missing-permission problem.

3. Improve PDF API diagnostics
   - Wrap `client.create_task(...)` in `pdf-server/app/core/queue.py` so Google Cloud errors are logged and returned as a concise actionable error instead of a huge FastAPI traceback.
   - Include queue id, task name, runtime project/region, and the invoker service account in the server log.

4. Stop leaking raw Python tracebacks to the customer UI
   - Adjust `supabase/functions/pdf-api/index.ts` so upstream `500` text tracebacks are converted into a safe JSON error for the app.
   - The UI should show “PDF inspection could not be queued” rather than the red traceback panel.

5. After implementation, run lightweight validation
   - Syntax-check the changed Bash, Python, and Edge Function files.
   - Then you’ll need to rerun the bootstrap in Cloud Shell once, or run the equivalent IAM grant directly:

```bash
PROJECT_ID=project-59a14b18-b4df-4c6b-b09
RUNTIME_SA=dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com
INVOKER_SA=cloud-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com

gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet
```

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>