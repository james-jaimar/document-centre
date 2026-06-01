# Branch invite link expired

## What happened

I confirmed in the database that James Hawkins (`hello@printmypics.co`) was invited successfully this morning:

- Profile created `2026-06-01 12:23:23 UTC`
- `tenant_memberships` row exists with `role = branch_manager` on the Test Branch
- He clicked the link around `16:14 UTC` — **roughly 4 hours later**

The invite email contains a Supabase **recovery** link generated via `admin.auth.admin.generateLink({ type: "recovery", ... })` in `supabase/functions/invite-member/index.ts`. Supabase's default expiry for recovery/OTP links is **1 hour**. That's why `AuthVerify.tsx` showed "This link has expired or has already been used."

So nothing is broken — the link simply timed out. But two real gaps need fixing:

1. There is **no "Resend invite" action on the Branch detail page** (`BranchUsersPanel`). Resend exists on Admin Users and Platform Users, but not where you invited James from.
2. A 1-hour window is too short for real-world invites (people open mail later in the day).

## Plan

### 1. Unblock James now
Use the existing `manage-user` Edge Function (`action: "resend_invite"`) to send him a fresh link. I'll trigger this for his profile so he gets a working email immediately.

### 2. Add "Resend invite" to the Branch users panel
In `src/components/branch/BranchUsersPanel.tsx`, add a row action (dropdown or icon button) that calls `useManageUser` with `resend_invite` for any branch member. Same confirm-dialog pattern as `AdminUsers.tsx`. Show "Invite resent" toast on success.

### 3. Extend the link lifetime
Recovery-link TTL is a project-wide auth setting and can't be changed per-link from the Edge Function. Two options:

- **(A) Raise the Supabase Auth OTP/recovery expiry** to e.g. 24 hours via the Auth settings (Dashboard → Auth → Email). I'll point you at the exact toggle; only you can change it. Lowest-effort, biggest payoff.
- **(B) Stop using `type: "recovery"` for invites and switch to `type: "invite"`** (longer default, 7 days), then handle the resulting `#access_token` flow in `AuthVerify` / `ResetPassword`. More code, but invites become first-class.

I recommend **(A) now** and consider **(B)** later if you want week-long invite windows without touching auth settings.

### 4. Friendlier expired-link screen
On `AuthVerify.tsx`, when the token is expired, show a "Request a new invite" button that calls a small public endpoint (or instruct the user to contact their admin). Today it's a dead-end message.

## Technical notes

- No DB migrations needed.
- `manage-user` already audits resend events into `user_admin_audit` (`kind: "resend_invite"`), so we get a trail for free.
- The Resend action in `BranchUsersPanel` must be gated to tenant owner/admin and the branch manager themselves (matches `manage-user` permission checks).
- For option (A), the setting lives at: Supabase Dashboard → Authentication → Providers → Email → "Email OTP Expiration".

## Out of scope

- Branch subscription gating (already resolved in the prior loop).
- Changing the email template or copy.

Shall I proceed with steps 1, 2, and 4, and leave the auth-settings change (step 3A) for you to flip in the dashboard?
