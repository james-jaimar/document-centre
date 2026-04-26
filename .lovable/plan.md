## Goal

Make outbound emails fire **immediately** on insert into `email_outbox` (push), while keeping the 5-minute cron as a safety net for retries, scheduled sends, and anything the push fires-and-forgets.

---

## Architecture: push + pull

| Path | Trigger | Purpose |
|---|---|---|
| **Push (happy path)** | `AFTER INSERT` trigger on `email_outbox` calls `email-dispatcher` via `pg_net.http_post` | Send brand-new emails within ~1–2s |
| **Pull (safety net)** | Existing 5-min `pg_cron` job | Retries with backoff, scheduled sends, recovery from dropped pg_net calls, stale-lock revival |

Both paths invoke the **same `email-dispatcher` function**, which already claims rows atomically with `locked_by` worker IDs — so concurrent push + cron is safe and dedupes naturally.

---

## 1. Database trigger (push)

New migration:

- Helper function `public.notify_email_dispatcher()` (SECURITY DEFINER, search_path = public):
  - Fires only when `NEW.status = 'queued'` AND `NEW.next_attempt_at <= now()` (skips scheduled-future rows — those are the cron's job)
  - Calls `net.http_post(url := <project-url>/functions/v1/email-dispatcher, headers := {Authorization: Bearer <service-role>}, body := '{}'::jsonb)`
  - Wrapped in `BEGIN ... EXCEPTION WHEN OTHERS THEN RETURN NEW; END;` so a pg_net hiccup never blocks the insert — cron will catch it.
- Trigger `email_outbox_push` on `AFTER INSERT ON public.email_outbox FOR EACH ROW EXECUTE FUNCTION notify_email_dispatcher()`.
- Service-role key stored in **Vault** as `email_dispatcher_service_role_key` (read inside the function — never inlined into migration SQL). Same pattern Lovable's own `process-email-queue` uses.

**Why a trigger, not direct SMTP from Postgres?** Postgres can't speak SMTP. `pg_net` is the standard async HTTP escape hatch and the same primitive Lovable's email queue uses.

---

## 2. Retry & timeout policy (already in place — confirming + tightening)

The dispatcher already has industry-standard retry semantics. I'll keep them and add one small hardening change:

| Setting | Current | Plan |
|---|---|---|
| Max attempts | **5** (column default on `email_outbox.max_attempts`) | Keep |
| Backoff | **1m → 5m → 15m → 1h → 6h** then `dlq` | Keep |
| Auth errors (535/530/invalid login) | Fail immediately, no retry | Keep — retrying bad creds is pointless |
| Stale lock revival | Rows stuck `sending > 5m` are re-queued | Keep |
| SMTP connect timeout | Default (denomailer ~60s) | **Add explicit 30s connect + 60s send timeout** so a hung SMTP server can't pin a worker |
| Per-account concurrency | `max_concurrent` on `email_accounts` (default 1) | Keep |
| Dispatcher batch | 20 rows / tick | Keep |

This matches what SendGrid/Postmark/SES use for transactional retries (5 attempts over ~7 hours).

---

## 3. Cron schedule

Already at `*/5 * * * *` from the previous migration. **Keep at 5 minutes** — it's now purely a backstop, not the primary delivery mechanism.

---

## 4. Edge function changes

`supabase/functions/email-dispatcher/index.ts`:
- Add explicit timeouts to the `SMTPClient` connection config (30s connect, 60s send).
- No other logic changes — the existing claim/lock/process loop already handles concurrent push+pull invocations correctly.

Redeploy after the change.

---

## 5. What I'm NOT doing (and why)

- **Not removing the cron.** Even with push, you need *something* to wake up retries scheduled for "now + 5 min" and scheduled sends with a future `scheduled_for`. That's inherently a timer.
- **Not switching to Lovable's built-in email queue.** You're using a custom multi-tenant SMTP system (`email_accounts` per tenant/branch with vault-stored creds, per-account concurrency caps). Lovable's queue assumes a single sender — it would be a regression.
- **Not adding LISTEN/NOTIFY or Realtime.** Both need a long-lived process; Edge Functions are stateless. `pg_net` from a trigger is the right primitive here.

---

## Expected impact

- **Latency**: new emails go out in ~1–2s instead of waiting up to 5 min for the next cron tick.
- **Disk IO**: no meaningful change — push triggers are write-once-per-email; the cron's near-empty ticks (which we already made cheap) remain the main background load.
- **Reliability**: strictly better. Push is best-effort; cron is the durable backstop. Same retry budget either way.

---

## Files touched

- New migration: `supabase/migrations/<timestamp>_email_outbox_push_trigger.sql` (creates Vault secret, helper function, trigger)
- `supabase/functions/email-dispatcher/index.ts` (add SMTP timeouts)
- Redeploy `email-dispatcher`
