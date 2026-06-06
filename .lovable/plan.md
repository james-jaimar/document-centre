## What the new error means

The upload is now failing at a different layer: the Document Centre API is still using the legacy Celery enqueue path during PDF inspection.

The visible stack points to:

```text
/app/app/core/queue.py, line 122, in enqueue
result = task.apply_async(...)
```

That line only runs when `QUEUE_BACKEND` is not set to `cloud_tasks`. So the current failure is not the earlier database-password issue and not the earlier `iam.serviceAccounts.actAs` issue. It is trying to enqueue the inspection job through Celery/Kombu instead of Cloud Tasks.

Do I know what the issue is? Yes: `pdf-api` needs `QUEUE_BACKEND=cloud_tasks` in Cloud Run now that upload inspection uses `app.core.queue.enqueue(...)`.

## Immediate production recovery

Run this in Cloud Shell:

```bash
PROJECT_ID=project-59a14b18-b4df-4c6b-b09
REGION=africa-south1

gcloud run services update pdf-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="QUEUE_BACKEND=cloud_tasks"
```

Then wait about 60 seconds and retry the same PDF upload.

## Codebase fix I will make after approval

1. Update `.github/workflows/pdf-server-deploy.yml`
   - Add `QUEUE_BACKEND=cloud_tasks` to the `pdf-api` deploy/update environment so future deploys do not silently revert to Celery.
   - Update the stale workflow comments that currently say `QUEUE_BACKEND` stays as `celery`.

2. Update `pdf-server/docker/gcp-tasks-bootstrap.sh`
   - Include `QUEUE_BACKEND=cloud_tasks` in the printed final env guidance.
   - Keep the existing invoker/IAM setup intact.

3. Add a lightweight guard/diagnostic if appropriate
   - Make Cloud Tasks mode fail with a clearer message if the required Cloud Tasks env vars are missing, instead of falling back into confusing Celery/Kombu traces.

## Why this should fix the current screenshot

The screenshot shows the upload reached `Inspecting PDF...` and then the API crashed while enqueuing the inspection task. With `QUEUE_BACKEND=cloud_tasks`, that same enqueue call will use `google.cloud.tasks` and the worker URLs/invoker service account already configured in the previous steps, instead of trying to contact the old Celery broker.

```xml
<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
```

```xml
<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>
```