
The user wants to stop relying on Supabase's built-in invite emails (the generic "You have been invited" system) and instead use the app's own email infrastructure when adding customers. Let me check what's available.

Key facts from context:
- `invite-member` edge function currently calls `supabase.auth.admin.inviteUserByEmail()` — this triggers Supabase's default auth email
- Memory says: "Custom SMTP 'send-email', Supabase default auth emails disabled"
- A `send-email` edge function exists
- There's also a `send-order-email` function
- SMTP secrets are configured (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT)

So the project already has its own SMTP-based email system, but `invite-member` bypasses it by using Supabase's admin invite API.

## The fix

Change `invite-member` to:
1. **Create the auth user directly** with `supabase.auth.admin.createUser()` (no email sent), generating a random password
2. **Generate a password-setup/recovery link** with `supabase.auth.admin.generateLink({ type: 'recovery' })` — this returns a magic link without sending an email
3. **Send a branded "You've been invited to {Tenant}" email** via the existing `send-email` function, containing that link
4. Profile + tenant_membership creation stays the same

This way:
- No more generic Supabase "You have been invited" emails
- Customer gets a branded email from the tenant with a "Set your password" CTA
- Same flow works for staff invites too (the function is shared)

## Plan

**Edit `supabase/functions/invite-member/index.ts`:**
- Replace `auth.admin.inviteUserByEmail` with `auth.admin.createUser({ email, email_confirm: true, password: <random> })`
- Generate a recovery link via `auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: <site>/reset-password } })`
- Look up tenant name + branding (logo, primary color) from `tenants` + `tenant_settings` to brand the email
- Invoke `send-email` with subject "You've been invited to {tenantName}" and an HTML body containing the setup link
- Keep the existing-user path unchanged (no email needed — they already have an account, just got added to the tenant). Optionally send a lighter "You've been added to {tenantName}" notification.

**No changes needed to:**
- `AddCustomerDialog.tsx` (already calls invite-member)
- `AddMemberDialog.tsx` (also calls invite-member — staff invites get the same upgrade for free)
- Database schema
- Frontend reset-password page (already exists at `/reset-password`)

**Verification:**
1. From `/admin/customers`, click "+ Add customer", enter a new email
2. Recipient gets a branded email from the tenant SMTP, not the generic Supabase one
3. Clicking the link lands on `/reset-password`, lets them set a password, then logs them in
4. They appear as an active customer in the tenant

## Technical detail

`generateLink` returns `{ properties: { action_link, hashed_token, ... } }` without sending — perfect for handing the URL to our own emailer. We use `type: 'recovery'` so the link routes through Supabase's password-reset flow (which the app already handles), letting the new user set their own password on first visit.
