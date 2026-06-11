## Exact issue

Your GitHub redeploy can be correct and emails can still fail, because the database is still triggering older email dispatch paths.

Current evidence:

- `INV-00080` is a fresh failed row queued at `06:00:13 UTC`, so this is not a stale UI row.
- The account is correctly configured as `graph_oauth` with a refresh token.
- The Cloud Run webhook fired successfully at exactly `06:00:13` and returned `ok`, so the new Cloud Run path was kicked.
- But the row was failed with the old message: `transport graph_oauth not yet implemented in pdf-server`.
- That exact message is not in current source code.
- The database still has a legacy trigger active: `email_outbox_push -> notify_email_dispatcher()`, which sends `pg_notify('email_enqueued', ...)`.
- The database also still has the old cron job active: `email-dispatcher-tick`, calling the old Supabase `email-dispatcher` every 5 minutes.

So the real problem is not Microsoft OAuth and not simply GitHub deployment. The problem is **mixed email dispatch infrastructure**:

```text
email_outbox insert
  ├─ new webhook -> Cloud Run email worker
  ├─ old LISTEN/NOTIFY trigger -> old VPS/Celery listener/worker if still running
  └─ old cron -> old Supabase email-dispatcher every 5 minutes
```

The immediate failure timing points most strongly at the old LISTEN/NOTIFY/Celery worker still running somewhere and racing the new Cloud Run worker. It claims the row first, uses old SMTP-only Python code, and writes the stale error.

## Fix plan

1. **Disable the legacy database dispatch paths**
   - Remove the old `email_outbox_push` trigger that emits `pg_notify`.
   - Disable/unschedule the old `email-dispatcher-tick` cron job.
   - Keep the new webhook trigger that posts to `https://api.document-centre.com/internal/email/notify`.

2. **Prevent old workers from claiming rows again**
   - If the VPS still exists, stop/disable:
     - `document-centre-listener-emails`
     - `document-centre-worker-emails`
     - old Celery beat if it is only being kept for email dispatch
   - The database change is the critical protection because it stops future inserts from notifying that old listener.

3. **Requeue the failed invoices after legacy paths are disabled**
   - Requeue the latest failed rows for `INV-00080` and `INV-00082`.
   - Confirm they move to `sent` via the new worker.

4. **Add a small safety diagnostic**
   - Keep future errors traceable by ensuring unknown transport errors include service/revision/role.
   - Optionally preserve the claiming worker identity long enough to identify stale workers if this ever recurs.

## Expected outcome

After the old trigger and old cron are disabled, only Cloud Run should process new email rows, so `graph_oauth` emails should stop failing with the old `not yet implemented` message.