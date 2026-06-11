## What the evidence shows

- The VPS Celery services are no longer the visible systemd units, but the email rows are still being re-claimed every lease cycle.
- The current claimant is `pdf-server:localhost:2`, and all 12 stuck rows share the same `claimed_at` / `worker_lease_until` window.
- That means something is successfully running `scan_outbox` and `claim_email_batch`, but the follow-up `send_email` work is not completing.
- This is probably not the original VPS worker PID anymore; `localhost` matches a container hostname pattern, so we need to debug Cloud Run / Cloud Tasks delivery rather than only systemd.

## Most likely failure points to check

1. **Cloud Tasks cannot invoke `pdf-worker-emails`**
   - `scan_outbox` claims rows on the emails worker, then enqueues per-row `send_email` tasks.
   - If `emails-default` tasks are rejected by OIDC/IAM/audience/service URL mismatch, rows stay `sending` until `release_stuck_claims` resets them.

2. **`pdf-worker-emails` is running an old or wrong revision**
   - The current code supports `graph_oauth`, but a stale worker revision could still claim and then fail before marking the row.
   - Need to verify live revision, env vars, and mounted Microsoft OAuth secrets.

3. **The email worker’s internal `send_email` task is crashing before DB status update**
   - Could be missing OAuth secret mounts, token refresh failure, attachment load issue, or a `self.request` Celery-context problem when a Celery task is invoked through the HTTP Cloud Tasks adapter.
   - Logs will tell which one.

4. **Scheduler/control queue is healthy, default queue is not**
   - Because claims are happening, `emails-control` is being delivered.
   - Because rows are not sent/failed, `emails-default` may be failing separately.

## Debug commands to run in Cloud Shell

Run these in Google Cloud Shell, not on the VPS:

```bash
gcloud config set project project-59a14b18-b4df-4c6b-b09
REGION=africa-south1
TASKS_REGION=europe-west1
```

### 1) Check live Cloud Run email worker revision and env

```bash
gcloud run services describe pdf-worker-emails \
  --region="$REGION" \
  --format='yaml(status.url,status.traffic,status.latestReadyRevisionName,spec.template.spec.containers[0].env)'
```

Look for:
- `ROLE=worker-emails-http`
- `QUEUE_BACKEND=cloud_tasks`
- `WORKER_SELF_URL=https://pdf-worker-emails-...run.app`
- `WORKER_URL_EMAILS=https://pdf-worker-emails-...run.app`
- `TASKS_INVOKER_SA=cloud-tasks-invoker@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com`
- `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` mounted as secrets

### 2) Check Cloud Tasks queues

```bash
gcloud tasks queues describe emails-control --location="$TASKS_REGION"
gcloud tasks queues describe emails-default --location="$TASKS_REGION"

gcloud tasks list --queue=emails-control --location="$TASKS_REGION" --limit=20
gcloud tasks list --queue=emails-default --location="$TASKS_REGION" --limit=20
```

If `emails-default` has many retries or old tasks, that is the failed send stage.

### 3) Check Cloud Run logs for the exact error

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-worker-emails"' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=200 \
  --order=desc \
  --format='value(timestamp,severity,textPayload,jsonPayload.message)'
```

Then narrow to email task failures:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-worker-emails" AND (textPayload:"send_email" OR textPayload:"task send_email failed" OR textPayload:"OIDC" OR textPayload:"credential" OR textPayload:"graph_oauth" OR jsonPayload.message:"send_email" OR jsonPayload.message:"OIDC" OR jsonPayload.message:"graph_oauth")' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=100 \
  --order=desc \
  --format='value(timestamp,severity,textPayload,jsonPayload.message)'
```

### 4) Check whether Cloud Tasks is getting HTTP errors from the worker

```bash
gcloud logging read \
  'resource.type="cloud_tasks_queue" AND resource.labels.queue_id=("emails-default" OR "emails-control")' \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --limit=100 \
  --order=desc \
  --format='value(timestamp,severity,textPayload,jsonPayload.status,jsonPayload.targetType,jsonPayload.url)'
```

If this shows 401/403, it is IAM/OIDC/audience. If 500, the worker code is crashing. If no logs, the tasks may not be enqueued or logging filter needs adjusting.

### 5) Manually trigger the scheduler path

```bash
gcloud scheduler jobs run email-scan-outbox-30s --location="$TASKS_REGION"
```

Then immediately read worker logs again. This should produce a `running task=scan_outbox` line, followed by `running task=send_email` lines if `emails-default` delivery works.

## Likely fixes depending on what logs show

### If logs show `invalid oidc token` / `missing bearer token`
- Re-run the GCP bootstrap to repair Cloud Tasks IAM and Scheduler/queue config:

```bash
bash pdf-server/docker/gcp-tasks-bootstrap.sh
```

Then re-run the GitHub deploy workflow so `WORKER_SELF_URL`, worker URLs, and secret mounts are current.

### If logs show missing Microsoft OAuth env/secrets
- Add or fix these Secret Manager entries, then re-run the deploy workflow:
  - `MICROSOFT_OAUTH_CLIENT_ID`
  - `MICROSOFT_OAUTH_CLIENT_SECRET`

### If logs show `send_email() missing self` or `AttributeError` around `self.request`
- Code fix needed: adapt the HTTP task runner or split the Celery-bound implementation so `send_email` can run safely outside a Celery worker.

### If logs show `graph_oauth_auth 400/401/403`
- The connected Microsoft mailbox refresh token may be revoked/expired, or the Azure app/client secret no longer matches. Reconnect the mailbox or rotate the Microsoft OAuth secret.

### If logs show attachment/storage errors
- The invoice PDF attachment path may be inaccessible to the Cloud Run worker; fix the attachment loader/storage permissions and then requeue.

## After root cause is fixed

- Release/requeue the stuck rows once more.
- Watch for `status='sent'` or a concrete `failed/dlq` error.
- Confirm in the recipient inbox and the app’s sent-mail UI.

## What I need from you

Please paste the output from sections **1, 2, 3, and 4** above. The exact error should be in the `pdf-worker-emails` or `emails-default` logs, and then I can give the precise fix instead of guessing.