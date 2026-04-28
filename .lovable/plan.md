## Goal

Fix the M365 SMTP "invalid cmd" failure by replacing `denomailer` with **`nodemailer@6.9.10`** in `email-dispatcher` — the same library you're already running successfully in `talkingdog-mckaynine-admin` and that Supabase uses in their official `send-email-smtp` example.

## Why

Current `email-dispatcher` uses `denomailer@1.6.0`, which crashes against `smtp.office365.com:587` with `event loop error: Error: invalid cmd` — a known denomailer bug with M365's STARTTLS command sequencing.

Your `talkingdog` `send-with-smtp` and `process-email-queue` functions both use `nodemailer@6.9.10` and just work. Same library, same secrets, no M365 changes needed.

## Changes

### `supabase/functions/email-dispatcher/index.ts`

Drop-in client swap. Everything else (queue claiming, vault creds resolution, per-account concurrency, error classification, retry/backoff, stale-lock revival) stays untouched.

1. **Imports**
   - Remove: `import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"`
   - Add: `import nodemailer from "npm:nodemailer@6.9.10"`

2. **In `processOne()`** — replace the `new SMTPClient({...})` block + `client.send({...})` + `client.close()` with the nodemailer pattern from your talkingdog app:

   ```ts
   const useSecure = creds.port === 465; // 465 = implicit TLS, 587 = STARTTLS
   const transport = nodemailer.createTransport({
     host: creds.host,
     port: creds.port,
     secure: useSecure,
     auth: { user: creds.username, pass: creds.password },
     tls: { rejectUnauthorized: false },
     connectionTimeout: 30000,
     greetingTimeout: 30000,
     socketTimeout: 60000,
   });

   const info = await withTimeout(
     transport.sendMail({
       from: `${fromName} <${fromEmail}>`,
       to: row.to_email,
       cc: row.cc ?? undefined,
       bcc: row.bcc ?? undefined,
       replyTo,
       subject: row.subject,
       html: row.html ?? undefined,
       text: row.text_body ?? undefined,
     }),
     SEND_TIMEOUT_MS
   );
   transport.close();
   ```

3. **Message-ID write-back** — change `(result as any)?.messageId` to `info.messageId` (nodemailer's actual field name).

4. **Keep**:
   - 60s `withTimeout` wrapper
   - All error classification: auth → `failed`, exhausted → `dlq`, transient → `queued` with `nextAttemptAt(...)`
   - `creds.send_delay_ms` pacing
   - `email_accounts` `last_verified_at` / `last_error` updates

### Verify

1. Deploy `email-dispatcher`.
2. Reset the stuck test row from `sending` → `queued` (one-line UPDATE migration) so it gets re-picked.
3. Watch `email-dispatcher` logs and the `email_outbox` row for `james@jaimar.dev` flip to `sent` with a real `info.messageId`.

## What stays unchanged

- `send-test-email` (already deployed with shared-secret auth)
- All SMTP secrets — same `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`
- `email_outbox` schema, RLS, push trigger, cron schedule
- `resolveCreds()`, vault loading, tenant fallback rules
- Per-account concurrency bucketing

## Risk

Very low. Same library you're already running in two other production apps. If M365 still rejects (e.g. SMTP AUTH disabled at the tenant), nodemailer will surface a clean SMTP response code (e.g. `535 5.7.139 SmtpClientAuthentication is disabled`) instead of the parser-level crash — giving us something actionable.
