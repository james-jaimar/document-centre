# Email dispatch cutover — pdf-server takeover

The Supabase Edge Function `email-dispatcher` is being retired. All outbound
email is now sent by the pdf-server Celery `worker-emails` pool. Edge
Functions remain the **enqueue** path (writing rows into
`public.email_outbox`); only the sender changed.

## What changed

| Concern | Before (edge dispatcher) | After (pdf-server) |
|---|---|---|
| Trigger | pg_cron every 5 min → edge function | Celery beat every 5s |
| Claim safety | per-row update | `claim_email_batch()` with `FOR UPDATE SKIP LOCKED` + lease |
| Concurrency | sequential per account, 1.5s delay | per-account semaphore (Redis) + Celery pool |
| Throughput ceiling | ~240/hr | 1000s/min, scales horizontally |
| Retry | manual `next_attempt_at` | Celery `autoretry_for` + DB row update |
| Stuck recovery | none | `release_stuck_claims()` every 5 min |
| Metrics | none | `email_send_metrics` table + Prometheus |
| Bounces/complaints | not tracked | `email_events` + `email_suppressions` via webhook |

## Deploy order

1. **DB migration (Phase 1) — DONE.**
   Adds claim/lease columns to `email_outbox`, `max_concurrency` to
   `email_accounts`, new tables `email_send_metrics`, `email_events`,
   `email_suppressions`, and RPCs `claim_email_batch` + `release_stuck_claims`.
   Backward compatible — old dispatcher keeps working.

2. **Deploy pdf-server** with this branch.
   Sets the env vars and starts the new `worker-emails` service. Beat
   schedule will start scanning `email_outbox` every 5s immediately.

   Required env vars on pdf-server (`.env`):

   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...   # service role, NOT anon
   REDIS_URL=redis://redis:6379/0
   CELERY_BROKER_URL=redis://redis:6379/0
   CELERY_RESULT_BACKEND=redis://redis:6379/1

   # Optional tuning
   EMAIL_BATCH_SIZE=50
   EMAIL_LEASE_SECONDS=120
   EMAIL_SCAN_INTERVAL_SECONDS=5    # informational; actual interval is in worker.py beat schedule
   EMAIL_DEFAULT_ACCOUNT_CONCURRENCY=4
   EMAIL_SMTP_CONNECT_TIMEOUT=15
   EMAIL_SMTP_TOTAL_TIMEOUT=60
   EMAIL_MAX_ATTACHMENT_BYTES=20971520

   # Webhook auth (rotate periodically)
   EMAIL_WEBHOOK_SECRET=<32+ random bytes>
   ```

3. **Smoke test** — enqueue a small batch via existing send-email flow.
   Watch:
   - `worker-emails` logs (`celery ... -n emails@%h`)
   - `SELECT status, count(*) FROM email_outbox GROUP BY status;`
   - `SELECT * FROM email_send_metrics ORDER BY bucket_at DESC LIMIT 10;`

4. **Unschedule the old cron.** Once you've seen ≥10 emails flow through
   pdf-server successfully:

   ```sql
   SELECT cron.unschedule(jobid)
   FROM cron.job
   WHERE jobname LIKE '%email-dispatcher%';
   ```

   This is the single cutover point. After this, the only sender is
   pdf-server. There is **no** double-send window because the new
   `claim_email_batch` uses `FOR UPDATE SKIP LOCKED` and immediately moves
   rows to `status='sending'`.

5. **Delete the old edge function.** After 24h of clean runs:

   ```
   rm -r supabase/functions/email-dispatcher
   # then run supabase--delete_edge_functions tool to deregister it
   ```

## Per-account throughput tuning

Each `email_accounts` row now has `max_concurrency` (default 4). For a
high-volume tenant on a generous SMTP provider, bump to 16:

```sql
UPDATE email_accounts SET max_concurrency = 16 WHERE id = '...';
```

The Redis-backed semaphore enforces this **across all pdf-server workers**,
so it remains correct as you scale horizontally.

## Webhook integration

POST `https://<pdf-server>/v1/webhooks/email/event` with header
`X-Webhook-Token: <EMAIL_WEBHOOK_SECRET>` and JSON body:

```json
{
  "event_type": "bounce",
  "recipient": "joe@example.com",
  "provider_message_id": "<abc@example.com>",
  "source": "mailgun",
  "raw": { ... original event ... }
}
```

`event_type` of `bounce`, `hard_bounce`, `complaint`, or `spam` will
automatically add the recipient to `email_suppressions` and any future
send to that address is marked `failed` before the SMTP call.

Batch endpoint: POST `/v1/webhooks/email/batch` with `{ "events": [...] }`.

## Transports not yet ported

Microsoft Graph (`transport='graph'`) and Gmail OAuth
(`transport='gmail_oauth'`) accounts are NOT handled by pdf-server yet —
they raise `CredentialError` and the row goes to `failed`. Tenants on
these transports must keep using the edge dispatcher OR be migrated to
SMTP relay before cutover. To extend, add `GraphCreds` / `GmailCreds`
dataclasses in `app/email/credentials.py` and the corresponding sender in
`app/email/smtp_client.py` (rename module or split).

## Rollback

If something goes wrong:

1. Stop the `worker-emails` container.
2. Re-enable the old pg_cron job that calls `email-dispatcher`.

Rows in `status='sending'` will be released by `release_stuck_claims()`
within 5 minutes of the lease expiring (default 120s), so nothing is lost.
