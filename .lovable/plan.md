# Fix: grant runtime SA permission to impersonate the Cloud Tasks invoker SA

## Progress so far

- ✅ DB password fix worked — `psycopg` now connects to Supabase pooler.
- ❌ Enqueue still fails, but with a **different, more specific** error:

```
google.api_core.exceptions.PermissionDenied: 403
The principal (user or service account) lacks IAM permission
"iam.serviceAccounts.actAs" for the resource
"cloud-tasks-invoker@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com"
```

## What's actually happening

When `pdf-api` enqueues a Cloud Task it tells Cloud Tasks: *"when you push this task to `pdf-worker-light`, attach an OIDC token signed as `cloud-tasks-invoker`."* That requires the **runtime SA** (`dc-pdf-runtime`, which `pdf-api` runs as) to be allowed to impersonate the **invoker SA** (`cloud-tasks-invoker`).

`gcp-tasks-bootstrap.sh` granted `roles/run.invoker` **on the worker services** to `cloud-tasks-invoker` (so the workers accept its token), but it never granted `dc-pdf-runtime` permission to **act-as** `cloud-tasks-invoker`. That's the missing link.

## The fix (one Cloud Shell command)

Grant `roles/iam.serviceAccountTokenCreator` on the invoker SA to the runtime SA. This is a resource-level binding — minimum privilege, scoped to just that one SA.

```bash
PROJECT_ID=project-59a14b18-b4df-4c6b-b09
RUNTIME_SA=dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com
INVOKER_SA=cloud-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com

gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

`serviceAccountTokenCreator` (not just `serviceAccountUser`) is the correct role because the Cloud Tasks client library mints an OIDC token under the hood — that requires token-creator, not plain `actAs`.

No Cloud Run revision bump needed. IAM propagates in ~30–60s.

## Verify

1. Wait ~60s.
2. Retry the upload in the Document Centre demo. The `Inspecting PDF…` step should complete instead of erroring.
3. Optional sanity:
   ```bash
   gcloud run services logs read pdf-worker-light --region=africa-south1 --limit=20
   ```
   You should see a `POST /tasks/run` arrive.

## Codify it so a fresh project doesn't hit this again

Once verified, append the same binding to `pdf-server/docker/gcp-tasks-bootstrap.sh`, right after the existing `roles/run.invoker` block:

```bash
log "Granting roles/iam.serviceAccountTokenCreator on $INVOKER_SA to dc-pdf-runtime (so pdf-api can mint OIDC tokens for Cloud Tasks)"
RUNTIME_SA="dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet
```

No app code changes, no migrations, no secret edits.
