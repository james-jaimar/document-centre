# Plan: fix Cloud Run email delivery after webhook cutover

## What is working now

The Supabase webhook is healthy:

```text
email_outbox insert
  → pg_net POST https://api.document-centre.com/internal/email/notify
  → HTTP 200
  → Cloud Task enqueued to emails-control
  → pdf-worker-emails wakes up
```

I confirmed a fresh webhook response:

```text
status_code: 200
content: { ok: true, enqueued: .../queues/emails-control/tasks/... }
```

## What is failing

The latest order email rows are being marked:

```text
status: failed
error_message: no_email_account
last_error_code: config_missing
email_account_id: null
```

The row that failed was for:

```text
tenant_id: c0000000-0000-0000-0000-000000000002
branch_id: 50af6453-1a97-4a1a-bf5b-e3c5b12cf66c
subject: Proforma Invoice for order INV-00070
recipient: jimmybhawkins@gmail.com
```

There is now an active branch SMTP account for that exact branch:

```text
from: hello@jaimar.dev
branch: 50af6453-1a97-4a1a-bf5b-e3c5b12cf66c
transport: smtp
active/default: true
```

But the failed outbox rows were inserted with `email_account_id = null`, and the new Python Cloud Run worker currently treats that as fatal.

## Root cause

The old Supabase Edge Function dispatcher (`email-dispatcher`) had fallback logic:

1. use the explicit account if present
2. otherwise find branch default
3. otherwise tenant default
4. otherwise any tenant account
5. otherwise platform Graph fallback

The new Cloud Run Python worker does **not** yet mirror that fallback. It only sends when `email_account_id` is already present on the outbox row.

Also, the enqueue helper intentionally returns `null` for tenants whose `email_send_method` is unset/defaulted to `platform`, so order emails can still enter the queue without a specific account. That was fine with the old dispatcher, but not with the new worker.

## Fix

### 1. Add account fallback resolution to Cloud Run email worker

Update `pdf-server/app/email/credentials.py` or a small helper beside it so the Python worker can resolve credentials from an outbox row when `email_account_id` is null:

```text
row.email_account_id
  → branch-scoped default SMTP account
  → any branch-scoped SMTP account
  → tenant-wide default SMTP account
  → any tenant SMTP account
  → platform Graph fallback only when Graph is implemented
```

For now, because Python worker only supports SMTP, it should pick an active SMTP account and skip Graph accounts cleanly.

### 2. Use fallback in `send_email`

Update `pdf-server/app/tasks/email_tasks.py`:

- if `row.email_account_id` exists: use it as today
- if missing: resolve a usable SMTP account from `tenant_id` + `branch_id`
- if still none: fail with `no_email_account` as today
- optionally write the resolved `email_account_id` back onto the outbox row for audit clarity

### 3. Keep webhook logic unchanged

The webhook is now confirmed working. No further changes needed there.

### 4. Prevent repeat confusion in docs

Update `pdf-server/docs/VPS_DECOMMISSION.md` with two clarifications:

- webhook URL must include `https://`
- after cutover, failed sends should be checked in `email_outbox.error_message` / `last_error_code`, not only `net._http_response`

## Verification after implementation

1. Re-run GitHub Action to deploy the Python worker.
2. Send/resend the test order email.
3. Confirm new `email_outbox` row resolves an account and reaches either:
   - `status = sent`, with `sent_at` filled, or
   - a real SMTP error if credentials are wrong.
4. Confirm no new `no_email_account` failures.

## Files to change

- `pdf-server/app/email/credentials.py`
- `pdf-server/app/tasks/email_tasks.py`
- `pdf-server/docs/VPS_DECOMMISSION.md`
