## Problem

`email_outbox` rows fail with `error_message='no_email_account'` even when the branch has a valid, active, default SMTP account. PostNet Sandton's INV-00085 proforma is the current example (branch `50af6453…`, account `97950a99…` is correctly configured).

## Root cause

`supabase/functions/_shared/email-queue.ts` (`resolveEmailAccount`, lines 74-88) gates branch/tenant SMTP lookup behind `tenant_settings.email_send_method`:

- Default (or unset) → `"platform"` → resolver returns `null` immediately, ignoring all configured tenant/branch SMTP accounts.
- Only `"own_smtp"` lets the lookup proceed.

The PostNet Sandton tenant has no `email_send_method` row, so the resolver returned `null`. The worker fallback (`resolve_account_id_for_row` in `credentials.py`) doesn't check this setting, but only if the worker is on the post-Jun-6 image. Either way the design is wrong: any tenant that adds SMTP without flipping the toggle silently fails.

## Fix

Make resolution implicit. If the tenant/branch has a configured active account, use it. The `email_send_method` toggle becomes unnecessary — having an account *is* the signal.

### Code changes

1. **`supabase/functions/_shared/email-queue.ts`** — delete the `email_send_method` gate (lines 71-88). Order of resolution becomes:
   1. explicit `email_account_id` (validated active)
   2. branch default (active)
   3. any active account on the branch
   4. tenant-level default (no branch)
   5. any active tenant-level account
   6. platform Graph fallback (existing tail logic at lines 125-135)

2. **`pdf-server/app/email/credentials.py`** — `resolve_account_id_for_row` already mirrors steps 2-5. Add step 6 (platform Graph fallback) so the worker behaves identically when an outbox row lands without `email_account_id`.

3. **`src/pages/admin/settings/EmailAccountsTab.tsx`** — remove the platform-vs-own-SMTP toggle (lines 54-104 plus its UI). The page now simply says "active accounts are used in this order: branch default → tenant default → platform fallback". One less footgun during onboarding.

4. **Migration** — backfill: drop any stale `email_send_method` rows so the resolver stops reading them. (Setting is no longer read after change 1.)

### Recovery for the stuck PostNet row

After deploying, re-queue `f74828a0-86f6-4dc0-861d-fc47ec3236d4`:
```sql
update email_outbox
set status='queued', attempts=0, error_message=null, last_error_code=null,
    locked_at=null, locked_by=null, worker_lease_until=null,
    next_attempt_at=now()
where id='f74828a0-86f6-4dc0-861d-fc47ec3236d4';
```

### Deploy

- `supabase--deploy_edge_functions`: every function that imports `_shared/email-queue.ts` (`email-dispatcher`, `send-email`, `send-order-email`, `send-test-email`, `manage-user`, `request-password-reset`).
- Worker change ships on next `pdf-server` Cloud Run deploy.

### Why this is safe

- DC tenant (Graph): no branch-level account exists, no tenant-level SMTP — resolver falls through to the existing Graph fallback at the end. Same behaviour.
- PostNet Sandton (SMTP): branch default is now picked up immediately. Fixes the bug.
- Any future tenant: drop in an SMTP/Gmail/Graph account, mark active+default, done. No hidden toggle to remember.