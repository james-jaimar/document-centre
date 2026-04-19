

Looking at the Platform Users page issue. Let me check the current state.

The user shows:
- Logged in as `james@jaimar.dev` (platform_admin)
- But the Platform Users row shows email `admin@printworx.co.za` linked to PrintWorx as owner

From the network log, I can see:
- `profiles` returns: `{"id":"430a7575...","email":"admin@printworx.co.za","display_name":"James Hawkins"}`
- `auth.users` JWT email: `james@jaimar.dev`

So the **profile row's email is stale** — it was set when the seed data was created with `admin@printworx.co.za`, but the actual auth account is `james@jaimar.dev`. The profile's `email` column was never synced when the auth email changed (or it was seeded incorrectly).

Also looking at `usePlatformUsers.ts`: it shows tenant memberships (PrintWorx owner) because that profile genuinely has an owner membership in PrintWorx — that's correct, not a bug. James is both a platform admin AND owner of PrintWorx.

The "limited actions" issue: looking at how the row menu is built, I need to check what actions are exposed for platform users vs tenant members. Let me lay out what's actually wrong and what to fix.

## Two distinct problems

### Problem 1: Stale email in `profiles.email`
The `profiles` row for user `430a7575…` has `email: admin@printworx.co.za` but the actual auth.users email is `james@jaimar.dev`. Two causes possible:
- Seed data inserted the wrong email
- Email was changed in auth but profile never updated

**Fix**: 
- Add a one-time data correction to sync `profiles.email` from `auth.users.email` for all profiles (backfill).
- Add a DB trigger on `auth.users` that keeps `profiles.email` in sync on email change going forward.

### Problem 2: Platform Users row only shows "force password reset" / "disable account"
Looking at `AdminUsers.tsx` (which is what renders the actions menu via `MembersTable`), the actions wired up are: Edit, Reset Password, Resend Invite, Toggle Active, Remove. But this is the **tenant** Users page, not the **platform** Users page.

The Platform Users page (`/platform/users`) uses `PlatformUsers.tsx` + `usePlatformUsers` and likely has its own row menu with a smaller action set. I need to read it to confirm what's there and what's missing.

I'll need to inspect `src/pages/platform/PlatformUsers.tsx` to see exactly which actions exist and design the missing ones.

## Plan

### Step A — Fix the data and prevent recurrence
1. Migration:
   - Backfill: `UPDATE public.profiles SET email = au.email FROM auth.users au WHERE profiles.id = au.id AND profiles.email IS DISTINCT FROM au.email;`
   - Trigger on `auth.users` AFTER UPDATE: when `email` changes, update `public.profiles.email`.
   - Also update `handle_new_user()` to set `profiles.email` from `NEW.email` on signup (currently it doesn't).

### Step B — Full CRUD on Platform Users
Inspect `PlatformUsers.tsx`. Add the missing actions to the row menu:
- **Edit user details** (display name, email) — wire to `manage-user` action `update_email` (already exists) + a new `update_profile` action for display name.
- **Force password reset** (already there)
- **Resend invite** 
- **Disable / Enable account** (already there as toggle)
- **Revoke platform admin** (existing `manage-user` action)
- **Remove from a specific tenant membership** (existing `remove_membership` action) — surfaced per-membership chip
- **Delete account** (existing `delete_account` action) — destructive, with confirmation
- **View tenant memberships** with quick "remove" per row

Layout: use a dropdown menu on the row + an "Edit" dialog for profile fields.

### Step C — Self-protection guardrails
- Don't allow a platform admin to: disable their own account, delete their own account, revoke their own platform_admin role.
- Backend (`manage-user`) should already enforce; UI should also disable those actions when `target_profile_id === auth.uid()`.

## What I'll change

**Migration**:
- Backfill profile emails from auth.users
- Add trigger `sync_profile_email_on_auth_change` 
- Update `handle_new_user()` to copy email

**Code**:
- `src/pages/platform/PlatformUsers.tsx` — expand row actions, add Edit dialog, add per-membership remove, add delete-account confirmation, add revoke-platform-admin
- Possibly extend `useManageUser.ts` types if a new `update_profile` action is added
- `supabase/functions/manage-user/index.ts` — add `update_profile` action (display_name, first_name, last_name) if not present, plus self-protection checks

**Verification**:
1. After migration, refresh `/platform/users` → row shows `james@jaimar.dev`.
2. Click row menu → see Edit, Reset Password, Resend Invite, Disable/Enable, Revoke Platform Admin, Delete Account.
3. Self-actions (disable/delete/revoke) are disabled with tooltip "Cannot perform on your own account".
4. Remove a tenant membership chip → membership disappears, account stays.
5. Edit display name + email → row updates, auth email actually changes.

