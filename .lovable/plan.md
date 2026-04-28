## Goal

Switch the `hello@document-centre.com` mailbox from SMTP (which is silently hanging on the M365 handshake) to **Microsoft Graph API with OAuth2 client credentials**. This is what Microsoft actually wants in 2026 and bypasses every SMTP AUTH / tenant-policy issue we've hit.

## Approach

Treat "Graph API" as a new **transport type** on `email_accounts`, sitting alongside SMTP. The dispatcher picks the transport per account and sends accordingly. This keeps the Postnet `mail.jaimar.dev` SMTP path working and gives every tenant the option of M365 Graph going forward.

## Changes

### 1. Schema — extend `email_accounts` (migration)

Add columns (all nullable so existing SMTP rows are untouched):

- `transport text not null default 'smtp'` — `'smtp'` or `'graph'`
- `graph_tenant_id text` — Azure tenant (directory) ID
- `graph_client_id text` — App registration client ID
- `graph_client_secret_id uuid` — Vault secret ID for the client secret (same pattern as `smtp_password_secret_id`)
- `graph_sender_address text` — mailbox to send as (e.g. `hello@document-centre.com`)

Make `smtp_*` columns nullable when `transport = 'graph'` (validation trigger, not CHECK constraint per project rules).

### 2. `email-account-manage` edge function

Extend the upsert action to accept Graph fields. When `transport = 'graph'`:
- Store `graph_client_secret` in Vault via existing `create_email_account_secret` RPC, persist returned `graph_client_secret_id`.
- Skip SMTP validation; instead `test_send` does a real Graph OAuth + sendMail round-trip.

### 3. `email-dispatcher` edge function

In `resolveCreds`, return a discriminated union: `{ kind: 'smtp', ... }` or `{ kind: 'graph', tenantId, clientId, clientSecret, sender, fromName, replyTo }`.

In `processOne`, branch on `kind`:

**SMTP branch:** unchanged (current nodemailer code).

**Graph branch:**
1. POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with `client_credentials` grant + `scope=https://graph.microsoft.com/.default` to get an access token. Cache in-memory per worker invocation (token is valid ~1h, but worker is short-lived — simple per-call fetch is fine).
2. POST to `https://graph.microsoft.com/v1.0/users/{sender}/sendMail` with the standard Graph message envelope:
   ```json
   {
     "message": {
       "subject": "...",
       "body": { "contentType": "HTML", "content": "..." },
       "toRecipients": [{ "emailAddress": { "address": "..." } }],
       "ccRecipients": [...],
       "bccRecipients": [...],
       "replyTo": [{ "emailAddress": { "address": "..." } }],
       "from": { "emailAddress": { "address": "hello@document-centre.com" } }
     },
     "saveToSentItems": true
   }
   ```
3. On 202 success: mark `sent`, store `messageId` from response headers (`x-ms-request-id`) since Graph's `sendMail` doesn't return a message-id directly. Update `last_verified_at`.
4. On 401/403 (auth/permission): mark `failed` immediately (terminal — same as SMTP auth errors).
5. On 429: respect `Retry-After` header for `next_attempt_at`.
6. On 5xx / network: backoff queue retry as today.
7. Wrap in same 60s timeout guard.

### 4. Seed/configure the M365 account

After deploy, run a one-off SQL/migration **insert or update** to create an `email_accounts` row for `document-centre`:
- `transport = 'graph'`
- `graph_tenant_id = '57593206-dca7-4402-84ac-a17dee9ec009'`
- `graph_client_id = '3e82c1f8-a79a-40c8-beb3-1929840d890f'`
- `graph_client_secret_id` → from Vault (created via `create_email_account_secret('document-centre-m365-graph', '<secret>')`)
- `graph_sender_address = 'hello@document-centre.com'`
- `from_email = 'hello@document-centre.com'`, `from_name = 'Document Centre'`
- `is_default = true` for whichever tenant should use it

### 5. Re-test the stuck test email

Update the existing pending `email_outbox` test row to point at this new account (or reset and resend from the UI), then watch `email-dispatcher` logs for the Graph round-trip.

### 6. Admin UI — defer

The Email Accounts settings UI currently only knows about SMTP fields. I'll leave it alone in this pass — the Graph account can be created via the seed step. We can add a "Transport: SMTP / Microsoft Graph" toggle to the form in a follow-up once we've confirmed the dispatcher works end-to-end.

## Required permissions on the Azure app registration

Just to flag — the app registration must have **Application permission** `Mail.Send` granted with **admin consent**. If that wasn't done, the first send will return `403 ErrorAccessDenied` and we'll see it in the logs immediately. You can confirm in Entra → App registrations → API permissions.

## What I will NOT change

- The Postnet `mail.jaimar.dev` SMTP account stays exactly as-is.
- The cron job, push trigger, `notify_email_dispatcher`, backoff math, and queue semantics are unchanged.
- Auth emails (Supabase native) are unrelated to this path.

## Verification

1. Deploy migration + edge functions.
2. Vault-store the client secret, insert the Graph account row.
3. Send a test email from the admin UI → row hits dispatcher → Graph token fetched → `sendMail` returns 202 → row marked `sent` within seconds → email lands in inbox.
4. If the app registration is missing `Mail.Send` admin consent, logs will show a clear `403 ErrorAccessDenied` and I'll tell you exactly what to grant.