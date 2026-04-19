

## Root cause

The "Send reset link" button calls `manage-user` → `auth.admin.generateLink({ type: "recovery" })`. That **only generates the recovery URL**; the actual email is sent by Supabase Auth firing its email webhook, which hits `auth-email-hook`. That hook is written to push the rendered email onto a pgmq queue (`enqueue_email` RPC) so the `process-email-queue` cron dispatcher can deliver it via the Lovable email API.

Two confirmed problems:

1. **Email queue infrastructure was never provisioned on this project.** The `email_send_log` table doesn't exist — query failed with `relation "email_send_log" does not exist`. This means the pgmq queues, `enqueue_email` RPC, `process-email-queue` function, and the pg_cron job that drains it are all missing. So `auth-email-hook` would error on `supabase.rpc('enqueue_email', ...)` with no email going out.

2. **The Supabase Auth "send email" webhook is likely not pointing at `auth-email-hook` either.** With no edge logs at all for `auth-email-hook` after a reset attempt, Supabase Auth isn't routing to it — the project still needs the Lovable Emails managed setup to wire the webhook + secrets.

The audit row for the recent attempt confirms it: `force_password_reset` at 09:51:22, `email_sent: false`. And `manage-user` lies a little — it returns "Password reset email sent" purely because `generateLink` succeeded, even though no email was queued or delivered.

There's also a parallel hole: the customer **self-service** "forgot password" path on the storefront still calls `supabase.auth.resetPasswordForEmail(...)` directly, which goes through the same Supabase webhook → also broken until the hook + queue exist. This is exactly the "Supabase email" the user complained about previously.

## Fix (single coordinated pass)

Three steps, all in one go:

1. **Provision email queue infrastructure** (Lovable Emails managed setup).
   - Provisions `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
   - Creates pgmq queues (`auth_emails`, `transactional_emails`)
   - Creates `enqueue_email` RPC (SECURITY DEFINER, granted to service role)
   - Deploys `process-email-queue` and schedules pg_cron every 5s
   - Wires `auth-email-hook` as the Supabase Auth send-email webhook with the verified sender domain `notify.document-centre.jaimar.dev`

2. **Re-deploy `auth-email-hook`** (templates already exist, just redeploy so it picks up the freshly created queue + RPC and confirms the contract).

3. **Make `manage-user` honest about delivery.** Change the `force_password_reset` branch to:
   - After `generateLink` succeeds, write a `pending` row to `email_send_log` itself (so we have a paper trail), and rely on the auth webhook → queue path (no double send).
   - Return a more accurate message: "Reset link sent — delivery is being processed" instead of pretending it left already.
   - On delivery failure (caught via the queue's DLQ tracking), the audit `email_sent` flag becomes meaningful.

## What stays the same

- The `manage-user` Edge Function authorisation (platform admin OR tenant owner/admin) — already correct.
- The branded `recovery.tsx` template scaffolded yesterday — keeps rendering through `auth-email-hook`.
- `useManageUser` hook + `AdminCustomerDetail` UI — no change.
- Customer self-service `/forgot-password` flow — automatically starts working as soon as the queue infra and webhook are in place, because `resetPasswordForEmail` flows through the same hook.

## Verification after fix

1. From `/admin/customers` → open `james_b_hawkins` → "Send reset link". Watch `email_send_log` go `pending → sent` within ~5s. Email arrives from `notify.document-centre.jaimar.dev`.
2. From the storefront's customer login, click "Forgot password". Same path, same outcome — branded email, no Supabase-domain leakage.
3. Audit row records `email_sent: true` (or `false` with an error reason) — no more silent lies.

