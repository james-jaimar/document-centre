# Welcome emails for tenant customers

Give staff a way to send a branded "Welcome — set your password" email to any customer, individually or in bulk, and force that person to set a new password before they can use the portal.

## What staff will see

**Company Users tab (tenant and branch admin)**
- Each user row gets a "Send welcome email" action.
- Tick boxes on the rows plus a "Send welcome email to selected" button for bulk sends, with a confirmation dialog and a summary toast ("Sent 4 of 5 — 1 has no email on file").
- A small status column shows when the last welcome email went out and whether the person has set their password yet.

**Customers list and customer detail**
- The same "Send welcome email" action in the existing row actions menu and on the detail page header.

**Add customer dialog**
- The existing "send invite" checkbox is relabelled "Send welcome email" and routes through the same flow so the wording and branding are identical everywhere.

## What the customer gets

A branded email (tenant logo, portal name, primary colour) with a single "Set your password" button. No password is included in the email. The link is one-time and valid for 1 hour; if it expires they can be re-sent one.

After they set the password they land in the tenant portal, already signed in.

## Forced password change

- Sending a welcome email marks the account as "must set password".
- Until they do, any portal page redirects them to the set-password screen — so even if they sign in another way, they cannot browse or order first.
- The flag clears the moment a new password is saved.

## Technical notes

- **Database**: add `must_change_password boolean not null default false` and `welcome_sent_at timestamptz` to `public.profiles`. No new tables, no grant changes.
- **Edge function**: add a `send_welcome` action to the existing `manage-user` function. It reuses the current `force_password_reset` branch (Supabase `generateLink` type=recovery + tenant-branded HTML + `enqueueEmail`) with welcome wording, sets `must_change_password = true` and `welcome_sent_at = now()`, and writes a `user_admin_audit` row. Authorisation reuses the existing tenant owner/admin/branch-staff checks. Bulk sending is the client looping the same action with a small concurrency limit.
- **create-customer**: when `send_invite` is true, call the same welcome path instead of only generating a bare recovery link, so the branded email is guaranteed rather than relying on the default auth hook.
- **Frontend**:
  - `useManageUser.ts` — add `send_welcome` to the action union.
  - `CustomerRowActions.tsx` — new menu item.
  - `CompanyUsersPanel.tsx` — selection checkboxes, bulk button, last-sent column.
  - `AdminCustomerDetail.tsx` — header action.
  - A guard in `CustomerLayout.tsx` (and the tenant/branch portal layouts) that redirects to `/reset-password` while `profiles.must_change_password` is true, with `welcome`, `reset-password` and `auth` routes exempt.
  - `ResetPassword.tsx` — clear the flag after a successful password update.
