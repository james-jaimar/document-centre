# Plan: Run everything from the Supabase SQL editor

Since the edge function call failed in Chrome, switch to a self-contained SQL script you paste into the Supabase SQL editor (https://supabase.com/dashboard/project/lcvdhtaqoumyokjqaqfw/sql/new). The SQL editor runs as service role, so it can write directly to `auth.users` — no edge function, no browser auth round-trip.

## What the script does

For tenant `a513d202-41f7-47eb-97be-47f2354b3bb1` (3@1):

1. Flip every branch `is_live = true`.
2. For each branch with a non-empty `email`:
   - Find existing `auth.users` row by email, or insert a new one with a random encrypted password and `email_confirmed_at = now()` (so the user exists but can't log in until they go through "Resend invite").
   - Upsert a `profiles` row (id, email, display_name = branch name) — only fill blanks.
   - Insert a `tenant_memberships` row (`role = 'branch_manager'`, `branch_id = branch.id`, `is_active = true`) unless one already exists for that profile in this tenant/app.
3. Return a results table (`branch_name, email, profile_id, status`) so you can eyeball the outcome before closing the tab. Statuses: `created`, `reused_existing_user`, `membership_exists`, `skipped_no_email`.

Wrapped in a single `DO $$ ... $$` block + final `SELECT` from a temp table, so it's one paste-and-run.

## Technical notes (safe to skip)

- `auth.users` insert uses `crypt(gen_random_uuid()::text, gen_salt('bf'))` for the password hash — `pgcrypto` is already enabled in Supabase. The password is unknowable; the only way in is the existing `invite-member` "Resend invite" flow which sends a magic link / password-set link.
- `email_confirmed_at = now()` so Supabase treats the address as verified — required for the invite flow to skip a second confirmation step.
- `aud = 'authenticated'`, `role = 'authenticated'`, `instance_id = '00000000-0000-0000-0000-000000000000'` to match every other Supabase auth row.
- `ON CONFLICT` guards on `auth.users.email`, `profiles.id`, and a uniqueness check on `(profile_id, tenant_id, app_id)` for `tenant_memberships` — re-running the script is idempotent.
- No invite emails are sent. You trigger those later from `/admin/users` per branch.

## What you'll do

1. Approve this plan.
2. I'll paste the full SQL script in the next message — you copy it into the SQL editor and run it.
3. We verify with `SELECT count(*) FROM tenant_memberships WHERE tenant_id = '…3bb1' AND role = 'branch_manager';` (expect ≤ 75) and a spot-check of 2–3 rows.

## Out of scope

- Sending invite emails (still deferred until you're ready per branch).
- PostNet — same script, swap the `tenant_id`, run again.
- Any branch branding / pricing / gateway changes.

```text
[SQL editor] --(service role)--> auth.users
                            \--> public.profiles
                            \--> public.tenant_memberships  (role=branch_manager, branch_id)
                            \--> public.branches            (is_live=true)
```
