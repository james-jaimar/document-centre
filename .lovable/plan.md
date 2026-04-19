

## What's actually wired today

- **`send-email` Edge Function** — generic SMTP sender using GLOBAL platform credentials (`SMTP_HOST/USER/PASS/PORT` secrets). Sends from one fixed mailbox for everyone.
- **`send-order-email`** — Same global SMTP, sends synchronously, logs to `email_log` (already has `app_id`, `tenant_id`, `order_id`, `event_key`, `recipient_email`, `subject`, `status`, `error_message`, `metadata`, `sent_at`).
- **`auth-email-hook`** — Tries to enqueue to a Lovable-managed `pgmq` queue (`enqueue_email` RPC). **None of that infra exists on this project** (no `pgmq`, no `pg_cron`, no `pg_net`, no `email_send_log`). It's been silently dead.
- **`Auth.tsx`** still calls `supabase.auth.resetPasswordForEmail(...)` and `supabase.auth.signUp(...)` directly → goes through Supabase's default mail.
- **`manage-user`** "force_password_reset" relies on the dead `auth-email-hook` path → nothing sends.
- Branches have an `email` column but there are no per-tenant/per-branch SMTP fields anywhere.

The user's two rules:
1. **App owns it.** No Supabase-default mail, no Lovable-managed queue. Everything goes through our own Edge Functions.
2. **Tenant (and optionally branch) owns the SMTP creds**, sent through our `send-email` function.

Plus: **proper queue + history (mini "sent items" inbox) per tenant/branch.**

## The plan

### 1. Per-tenant / per-branch SMTP credentials

New table `email_accounts` (encrypted password via Supabase Vault):

```text
email_accounts
  id, tenant_id (req), branch_id (nullable),
  label,             -- "Main", "Sandton branch", etc.
  from_name, from_email, reply_to,
  smtp_host, smtp_port, smtp_secure ('tls'|'starttls'|'none'),
  smtp_username, smtp_password_secret_id (vault ref),
  is_default boolean,
  is_active boolean,
  last_verified_at, last_error,
  timestamps
```
RLS: tenant owners/admins manage their rows; service role reads. Resolution order at send time: explicit account → branch default → tenant default → **platform fallback** (existing `SMTP_*` secrets). Platform fallback is opt-in per tenant via a `tenant_settings` flag, so a tenant without configured SMTP still works during onboarding, but a configured tenant never silently falls back.

UI:
- New tab **Admin → Settings → Email Accounts** (CRUD + "Send test").
- Branch detail page gets an **Email Account** card (pick existing tenant account or define a branch-specific one).
- The existing `NotificationsTab` "Sender Name/Email" stays, but becomes a *display* override on top of the chosen account.

### 2. Proper outbound queue + history

Replace the synchronous SMTP send with a **persistent DB-backed queue** (no `pgmq` — we own it):

```text
email_outbox  (the queue + history; one row per email, full lifecycle)
  id, tenant_id, branch_id, app_id,
  email_account_id,             -- which mailbox sent it (resolved at enqueue)
  to_email, cc, bcc, reply_to,
  from_name, from_email,
  subject, html, text,
  category,                     -- 'auth' | 'order' | 'invite' | 'transactional' | 'manual'
  related_type, related_id,     -- e.g. 'order', uuid
  status,                       -- queued | sending | sent | failed | dlq | cancelled
  attempts, max_attempts (default 5),
  next_attempt_at,              -- backoff schedule
  locked_at, locked_by,         -- worker lease
  scheduled_for,                -- for delayed sends
  error_message,
  message_id,                   -- SMTP Message-ID once accepted
  queued_at, sent_at,
  created_by_profile_id,
  metadata jsonb
```

- **Single dispatcher Edge Function `email-dispatcher`** runs every 30s via `pg_cron + pg_net` (we'll enable both extensions). It:
  - Claims up to N rows per tenant per cycle with `SELECT ... FOR UPDATE SKIP LOCKED` and a per-account concurrency cap (default 1 in flight, configurable) → that's the "don't give the SMTP box a heart attack" guard.
  - Per-account inter-send delay (default 1.5s).
  - On success: status `sent`, `sent_at`, store SMTP Message-ID.
  - On 4xx/auth errors: `failed` immediately + `email_account.last_error`.
  - On 5xx/transient: bump `attempts`, exponential backoff (1m, 5m, 15m, 1h, 6h), then `dlq`.
- **`send-email` keeps its current contract** but its body is rewritten to *enqueue* into `email_outbox` instead of sending directly. Existing callers (`manage-user`, `invite-member`, `invite-platform-admin`, `send-order-email`) keep working with one tiny addition: they pass `tenant_id` (and optional `branch_id`, `category`, `related_type/id`).
- `send-order-email` is refactored to enqueue too (gives it retries + history "for free"); the heavy HTML rendering stays in-function.
- The legacy `email_log` table is migrated into `email_outbox` and then dropped. No more dual sources of truth.

### 3. Kill all Supabase-default mail paths

- `auth-email-hook` is **deleted** (and removed from `config.toml`). With it gone, Supabase Auth would fall back to its default templates — to prevent that we **stop using `supabase.auth.resetPasswordForEmail` and `supabase.auth.signUp` for email-bearing flows**:
  - **Customer self-service forgot-password** (`Auth.tsx`) → calls a new `request-password-reset` Edge Function that uses `auth.admin.generateLink({ type: 'recovery' })` to mint the link (no email), then enqueues a branded email through `send-email` using the tenant's account. Same pattern `manage-user` already uses for `resend_invite`.
  - **Customer self-service signup** (`Auth.tsx`) on a tenant portal → new `request-signup` Edge Function: creates the user (or generates a signup link if confirmation required), then enqueues the branded "confirm your email" via the tenant account.
- `manage-user.force_password_reset` switches from "let Supabase send it" to the same generate-link-then-enqueue pattern that `resend_invite` already does. Now its "email_sent" audit flag is meaningful again.
- Remove the dead `_shared/email-templates/*.tsx` React-Email files (or keep just as raw HTML helpers — TBD during impl).

### 4. The "mini Outlook" view

New page **Admin → Communications → Sent Mail** (and a per-branch filter):
- Stats strip: queued, sending, sent today, failed, DLQ.
- Filters: account, category, status, date range, search (to / subject).
- Table: timestamp, to, subject, category, account, status (badge), attempts.
- Row drawer: full HTML preview, plain-text, headers, error trail, "Resend", "Cancel queued", "Move to top of queue".
- Per-account health card: last successful send, last error, throughput.
- Customer detail page already lists order emails — relink it to `email_outbox`.

### 5. Security / RLS

- `email_accounts` & `email_outbox`: select/insert/update for tenant owners/admins of `tenant_id`; branch staff scoped to their branch_id; service role full access (used by dispatcher).
- SMTP passwords via Supabase Vault, never returned to the client. Test-send uses a service-role round trip.
- No raw SQL anywhere; dispatcher uses parameterised supabase-js calls.

## Migration / cutover sequence

1. Enable `pg_cron`, `pg_net`. Create `email_accounts`, `email_outbox`, copy `email_log` → `email_outbox`, drop `email_log`.
2. Add `email-dispatcher` Edge Function + cron schedule (every 30s).
3. Rewrite `send-email` to enqueue. Update `manage-user`, `invite-member`, `invite-platform-admin`, `send-order-email` to pass `tenant_id` + category.
4. Add `request-password-reset` + `request-signup` Edge Functions; switch `Auth.tsx` to call them.
5. Remove `auth-email-hook` from code and `config.toml`.
6. Build the **Email Accounts** settings UI + **Sent Mail** dashboard.
7. Verify: PostNet customer "forgot password" → row appears in `email_outbox` as `queued` → `sent` within 30s, branded email arrives from the PostNet tenant's mailbox.

## What stays the same

- The existing branded order email layout in `send-order-email`.
- Existing tenant branding (`tenant_settings.branding`) still drives header/colour/logo.
- Global `SMTP_*` secrets remain as platform fallback only.

