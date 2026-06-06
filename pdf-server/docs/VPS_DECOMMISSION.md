# VPS Decommission — replace LISTEN/NOTIFY with Supabase Database Webhook

Goal: eliminate the `document-centre-listener-emails` VPS service and shut
down the VPS entirely. Email-send latency target: < 1 second (same as
LISTEN/NOTIFY).

## How it works

```
   email_outbox INSERT
            │
            ▼
   AFTER INSERT trigger (pg_net.http_post, async)
            │  POST https://<pdf-api>/internal/email/notify
            │  X-Webhook-Token: <EMAIL_NOTIFY_TOKEN>
            ▼
   pdf-api → enqueue scan_outbox → emails-control queue
            │
            ▼
   pdf-worker-emails claims batch + sends SMTP
```

`pg_net.http_post` is fire-and-forget and runs in the background — the
INSERT transaction is not blocked. Cloud Scheduler's `email-scan-outbox`
job (every 1 min) remains as the safety net.

## Cutover steps

### 1. Deploy pdf-server

The new `POST /internal/email/notify` endpoint ships in this branch.
After the GitHub Action deploys, verify:

```bash
curl -i https://<pdf-api-url>/internal/email/notify \
  -X POST -H "X-Webhook-Token: wrong"
# Expect: 401 invalid webhook token   (or 503 if EMAIL_NOTIFY_TOKEN unset)
```

### 2. Create the shared secret

Generate a random 32-byte token, then add it to GCP Secret Manager AND
remember it for the SQL in step 3.

```bash
TOKEN=$(openssl rand -hex 32)
echo "$TOKEN"   # save this — needed in step 3

printf '%s' "$TOKEN" | gcloud secrets create PDF_EMAIL_NOTIFY_TOKEN \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --data-file=-

# Grant the runtime SA read access (idempotent)
gcloud secrets add-iam-policy-binding PDF_EMAIL_NOTIFY_TOKEN \
  --project=project-59a14b18-b4df-4c6b-b09 \
  --member="serviceAccount:dc-pdf-runtime@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Re-run the GitHub Action — pdf-api will now mount `EMAIL_NOTIFY_TOKEN`
from Secret Manager.

### 3. Install the Supabase trigger

Replace `<PDF_API_URL>` and `<EMAIL_NOTIFY_TOKEN>` with real values, then
run in the Supabase SQL editor (NOT a migration — the trigger contains
project-specific URL and secret).

> **CRITICAL:** `<PDF_API_URL>` MUST include the `https://` scheme
> (e.g. `https://api.document-centre.com`). `pg_net.http_post` silently
> drops calls when the scheme is missing — no row appears in
> `net._http_response` and emails will only be sent by the 1-minute
> Cloud Scheduler safety net.

> **Troubleshooting:** if emails enqueue but never arrive, check in this
> order:
>   1. `SELECT status, error_message, last_error_code FROM email_outbox ORDER BY queued_at DESC LIMIT 10;`
>   2. `SELECT status_code, error_msg FROM net._http_response ORDER BY created DESC LIMIT 10;`
>   3. Cloud Run logs for `pdf-worker-emails`.


```sql
-- Ensure pg_net is available (already enabled on Document Centre's project).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: fire the webhook on every email_outbox INSERT.
CREATE OR REPLACE FUNCTION public.notify_email_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget; pg_net runs the HTTP call in a background worker so
  -- the INSERT transaction is not blocked. Body is informational only —
  -- the endpoint kicks scan_outbox regardless of payload.
  PERFORM net.http_post(
    url     := '<PDF_API_URL>/internal/email/notify',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Webhook-Token',  '<EMAIL_NOTIFY_TOKEN>'
    ),
    body    := jsonb_build_object(
      'outbox_id', NEW.id,
      'event',     'email_enqueued'
    ),
    timeout_milliseconds := 2000
  );
  RETURN NEW;
END;
$$;

-- Replace the existing LISTEN/NOTIFY trigger (kept around until VPS off).
DROP TRIGGER IF EXISTS trg_notify_email_webhook ON public.email_outbox;
CREATE TRIGGER trg_notify_email_webhook
AFTER INSERT ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.notify_email_webhook();
```

### 4. Verify

Send a test email via the existing `send-email` Edge Function and confirm:

- `email_outbox.status` flips `pending → sending → sent` within a few seconds.
- `pdf-worker-emails` Cloud Run logs show a `scan_outbox` invocation
  immediately after the insert (look for `email.tasks: scan_outbox
  dispatched=N`).
- `pg_net._http_response` shows a 200 response for the webhook:
  ```sql
  SELECT id, status_code, created
  FROM net._http_response
  ORDER BY created DESC LIMIT 5;
  ```

### 5. Decommission VPS

After 24h of clean operation:

```bash
# On the VPS:
sudo systemctl disable --now document-centre-listener-emails.service

# Optional: drop the now-unused LISTEN/NOTIFY trigger
# psql:
DROP TRIGGER IF EXISTS notify_email_dispatcher ON public.email_outbox;
DROP FUNCTION IF EXISTS public.notify_email_dispatcher();

# Cancel the VPS.
```

Update `pdf-server/docs/GCP_CUTOVER.md` to mark the VPS section as
"removed".

## Rollback

If the webhook proves unreliable, re-enable the VPS listener — the
Cloud Scheduler `email-scan-outbox` job (every 1 min) is a sufficient
fallback in the meantime. Both the webhook and the listener can run
simultaneously without producing duplicate sends because
`claim_email_batch()` uses `FOR UPDATE SKIP LOCKED`.

## VPS ↔ Cloud Run runtime differences (cheat sheet)

Behavioural gaps to be aware of when debugging — none of them are code
bugs, they're consequences of the runtime topology change.

| Concern | VPS (Celery + Redis) | Cloud Run + Cloud Tasks |
| --- | --- | --- |
| Worker warmth | 8 prefork children always resident on `light` | `--concurrency=1`, instances cold-start on demand |
| Per-page render fan-out | Instant pickup by warm children | One Cloud Run cold start per page → very slow |
| PDF handoff cache | Shared `/var/cache/document-centre/pdf-cache` between heavy + light | Separate ephemeral FS per service — cache always misses |
| Email push path | Long-lived `LISTEN email_enqueued` process | `pg_net.http_post` Database Webhook → `/internal/email/notify` |
| Email safety-net sweep | Celery beat every 30s | Cloud Scheduler every 1 min (`email-scan-outbox`) |
| Stuck-claim recovery | Celery beat every 5 min | Cloud Scheduler every 5 min (`email-release-stuck`) |
| Beat scheduler | `celery beat` in-process schedule | Cloud Scheduler jobs created by `gcp-tasks-bootstrap.sh` |
| `print(...)` visibility | journalctl captured everything | Only `logger.*` lands in Cloud Logging |

### Render fan-out is force-disabled under Cloud Tasks

`pdf-server/app/tasks/document_tasks.py::generate_previews` checks
`QUEUE_BACKEND` at runtime — when it's `cloud_tasks`, fan-out is
disabled regardless of `RENDER_FANOUT_ENABLED`, and the in-process
`ThreadPoolExecutor` path runs all remaining pages inside the one warm
container. This mirrors the VPS prefork behaviour and avoids paying
N cold starts. Keep `pdf-worker-light` at `--cpu=4 --memory=4Gi` so the
thread pool actually has 4 vCPUs to spread across.

