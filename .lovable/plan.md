## Goal
Replace the stale `SMTP_*` platform secrets with the new Microsoft 365 mailbox credentials for `hello@document-centre.com`, then send a test email end-to-end and confirm it lands.

## Steps

### 1. Update the four platform SMTP secrets
Overwrite the existing values:
- `SMTP_HOST` = `smtp.office365.com`
- `SMTP_PORT` = `587`
- `SMTP_USER` = `hello@document-centre.com`
- `SMTP_PASS` = `Hawkeye@12209!`

No code changes — `email-dispatcher` already reads these and auto-selects STARTTLS on port 587.

### 2. Set sensible default From identity
Update the existing platform default in `tenant_settings` (or insert if missing) so any future enqueue without an explicit `from_*` falls back to a branded sender:
- `from_name` = `Document Centre`
- `from_email` = `hello@document-centre.com`

### 3. Build a tiny `send-test-email` Edge Function (platform-admin only)
- Verifies caller is `platform_admin` via `supabase.auth.getUser()` + `has_role`
- Accepts `{ to: string, subject?: string }`
- Uses the new `_shared/branded-shell.ts` to render a styled "SMTP test" email
- Enqueues into `email_outbox` with `from_name = "Document Centre"`, `from_email = "hello@document-centre.com"`
- Returns the `outbox_id` so we can watch it flip status

### 4. Fire a real test
Invoke `send-test-email` with `to = jaimar@…` (whatever inbox you want to receive at). Watch `email_outbox` for that row's `status`:
- `queued → sending → sent` = SMTP works, M365 accepts plain auth, we're done
- `failed` with `535/auth/credentials` in `error_message` = M365 has SMTP AUTH disabled or needs an App Password
- `failed` with timeout / TLS error = network or port issue

### 5. Branch on the result
- **If sent successfully**: confirm to you, then move on to (a) re-skinning the contact-form auto-reply through `branded-shell.ts` end-to-end, and (b) optionally piping the auth/order email fallback through it for tenants without their own SMTP.
- **If M365 rejects auth**: I'll give you the exact 3-click steps to either:
  - Enable SMTP AUTH on the mailbox in the M365 admin centre + generate an App Password, OR
  - Pivot to the Microsoft Graph API path (refactor `email-dispatcher` to send via Graph using a registered Azure AD app — more setup but future-proof)

## Technical details
- Secrets are updated via the secrets tool, not committed to code
- New edge function: `supabase/functions/send-test-email/index.ts` (verify_jwt enabled — platform-admin only)
- Reuses `_shared/branded-shell.ts` from the contact-form work
- No DB migration needed unless step 2 reveals the platform-default `tenant_settings` row is missing (then a 1-row insert)

## What I need from you
Nothing right now — once you approve, I'll set the secrets, build the test function, fire it at an address of your choice (or `hello@document-centre.com` itself), and report back with either "delivered" or the exact M365 error so we know our next move.