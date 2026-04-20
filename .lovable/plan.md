

## Root cause

Clicking "Send reset link" on `/admin/customers/:id` does this:

1. `useManageUser` calls edge function `manage-user` with `action: force_password_reset`.
2. `manage-user` calls `auth.admin.generateLink({ type: 'recovery' })` — succeeds (auth log shows `/admin/generate_link` 200, `user_recovery_requested`).
3. Function then comments: "the actual email is dispatched by Supabase Auth firing its send-email webhook → auth-email-hook → pgmq queue".
4. **There is no `auth-email-hook` in this project**. This project routes all email through `email_outbox` (`enqueueEmail`) + `email-dispatcher` + tenant SMTP accounts.
5. Result: link is generated, nothing is enqueued, nothing is sent. UI closes the dialog with no toast either way (see point 7).

Compare with `request-password-reset` (customer self-service) — it already does the right thing: builds the branded HTML, calls `enqueueEmail({ category: 'auth', ... })`. We just need the admin path to do the same.

A second smaller bug:
- `useManageUser` has no `onSuccess`/`onError` toast, and `AdminCustomerDetail.handlePasswordReset` doesn't show one either. So even when actions like "Change email" succeed, the user sees nothing happen.

## Fix

### 1. `supabase/functions/manage-user/index.ts` — actually send the reset email

For both `force_password_reset` and `resend_invite`:
- Resolve tenant branding (portal_name, primary_color, logo_url) — same lookup pattern as `request-password-reset`.
- Build the branded HTML/text email with the generated `actionLink`.
- Call `enqueueEmail(admin, { tenant_id, app_id, to: targetEmail, subject, html, text, category: 'auth', metadata: { kind: 'force_password_reset' | 'resend_invite', profile_id: target_profile_id } })`.
- Stop using direct `send-email` HTTP call for `resend_invite` — switch it to `enqueueEmail` too for consistency, branding, and SMTP routing via `email_accounts`.
- Return `{ success: true, message: "Reset link sent to {email}" }` once enqueued. Audit row records `delivered_via: "email_outbox"`.

This brings admin-triggered resets onto the same SMTP pipeline as customer self-service resets, which we already know works (recent successful customer auth events in logs).

### 2. `src/hooks/useManageUser.ts` — surface success / failure

Add toast feedback so admins always see what happened:
- `onSuccess`: `toast.success(data?.message ?? "Done")`
- `onError`: `toast.error(error.message)`

Keep existing query invalidations.

### 3. `src/pages/admin/AdminCustomerDetail.tsx` — close dialog cleanly

Tighten `handlePasswordReset` to close the dialog inside `onSettled` (so it closes regardless of outcome). The toast comes from the hook.

## What you'll see after the fix

1. Open `/admin/customers/<id>` → click **Send reset link** → confirm.
2. Toast: "Reset link sent to email@example.com".
3. Email arrives via the tenant's SMTP account (Document Centre / PostNet branded), with a link to `/auth/verify?...&next=/reset-password` on the tenant portal.
4. Customer clicks → lands on `/reset-password`, sets a new password, redirected to `/auth`.

## Files

- `supabase/functions/manage-user/index.ts` — branded email + `enqueueEmail` for both reset & invite paths
- `src/hooks/useManageUser.ts` — toast on success/error
- `src/pages/admin/AdminCustomerDetail.tsx` — close dialog in `onSettled`

## Out of scope

- No DB migrations.
- No new edge functions.
- No changes to the customer-facing `request-password-reset` (already correct).
- No changes to `ResetPassword.tsx` / `AuthVerify.tsx` (the link already targets the right route).

## Verification

1. From `/admin/customers/<a customer with email>` → "Send reset link". Expect success toast and email delivery.
2. Inspect `email_outbox` for a new row with `category='auth'` and `metadata.kind='force_password_reset'`.
3. `/admin/users` → MembersTable → "Force password reset" on a tenant member should also send the same branded email.
4. Same flow for "Resend invite" (sends branded sign-in link via `email_outbox`).
5. Negative: a profile with no email shows the existing 400 error.

