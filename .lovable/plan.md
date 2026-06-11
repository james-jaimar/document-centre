## What's actually happening

Three independent facts confirmed from your diagnostics:

1. **The old VPS (`srv1516161`) is still running the email stack** — listener, Celery worker, and beat are all `active (running)` since 06:44 UTC today, with old code that has no `graph_oauth` transport. It's claiming outbox rows as `pdf-server:localhost:2` and breaking them with the legacy "transport graph_oauth not yet implemented in pdf-server" error.
2. **Cloud Run `pdf-worker-emails` (rev 00143-r9d) is healthy** — Microsoft OAuth secrets are wired, Cloud Scheduler is calling `scan_outbox` every minute and `release_stuck` every 5 min, scans return 200.
3. **`release_stuck_claims()` is broken** — it tries to set `status='retry'`, but the `email_outbox_status_check` constraint only allows `queued | sending | sent | failed | dlq | cancelled`. Every release run 500s, so the two rows claimed by the dead VPS worker (INV-00080, INV-00082, claimed 08:29, lease expired 08:31) are stuck in `sending` forever and Cloud Run never gets to retry them.

So the loop is: VPS claims row → VPS fails or hangs → release_stuck can't unstick it → row sits as `sending` forever → Cloud Run worker never sees it.

## Fix plan

### 1. Decommission the old VPS email services (you run on the VPS)

These three units must be stopped and disabled so they stop claiming rows. They are not needed — Cloud Run + Cloud Scheduler fully replaces them.

```bash
systemctl stop document-centre-listener-emails document-centre-worker-emails document-centre-beat
systemctl disable document-centre-listener-emails document-centre-worker-emails document-centre-beat
systemctl status document-centre-listener-emails document-centre-worker-emails document-centre-beat --no-pager | grep -E 'Active|Loaded'
```

Note: `document-centre-beat` is the Celery scheduler for the old emails-only beat schedule on this VPS — Cloud Scheduler now owns that. If you have other non-email beat jobs still wanted here, tell me and we'll narrow it.

### 2. Fix `release_stuck_claims()` in the database (migration)

Rewrite the function to set stuck rows back to `queued` (a valid status), clear all claim/lease fields, and set `next_attempt_at = now()` so the Cloud Run worker picks them up on the next 1-minute scan. Stuck = `status = 'sending'` AND `worker_lease_until < now()`.

```sql
CREATE OR REPLACE FUNCTION public.release_stuck_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.email_outbox
     SET status = 'queued',
         claimed_by = NULL,
         claimed_at = NULL,
         worker_lease_until = NULL,
         locked_by = NULL,
         locked_at = NULL,
         next_attempt_at = now()
   WHERE status = 'sending'
     AND worker_lease_until IS NOT NULL
     AND worker_lease_until < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
```

### 3. Requeue the stuck and recent-failed invoices (data update)

After step 1 is done so they can't be re-claimed by the dead worker, requeue:

- The two `sending` rows: `aa13537f-…` (INV-00080), `f1cdf704-…` (INV-00082)
- The recent `failed` rows that died on the legacy "graph_oauth not implemented" message: `6ceab9ad-…`, `944aac8c-…`, `8e33a1f7-…` (all INV-00076 / INV-00082)

For each: `status='queued'`, `attempts=0`, `error_message=NULL`, `last_error_code=NULL`, `next_attempt_at=now()`, `scheduled_for=NULL`, clear `claimed_by/claimed_at/worker_lease_until/locked_by/locked_at`.

I will leave the older `no_email_account` failures alone — those were a different cause from before OAuth was configured. Tell me if you want them retried too.

### 4. Verify

- Watch Cloud Run logs for `pdf-worker-emails` over the next 1–3 minutes — expect successful sends, no more `release_stuck` 500s.
- Re-query `email_outbox` for the five IDs: expect `status='sent'` with a `provider_message_id`.
- If any still fail, the error will now be a real Microsoft Graph OAuth response (token / scope / mailbox), not the stale VPS message — that's the next, separate fix.

## Out of scope (deliberately)

- Removing the now-redundant `email_outbox_push` trigger / old Supabase `email-dispatcher` cron. Worth doing for cleanliness, but stopping the VPS workers already breaks the legacy path. I can do it in a follow-up once sends are confirmed green.
- Any change to invoice generation or email templates.

## After your approval

Switch me to build mode and I will:
- Issue the migration in step 2 (one approval prompt from Supabase).
- Issue the data update in step 3 (one approval prompt from Supabase).
- Tail logs / re-query the outbox and report back.

You only need to run the `systemctl` commands in step 1 on the VPS yourself.
