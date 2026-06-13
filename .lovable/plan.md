## Goal

For the 3@1 tenant (`a513d202-41f7-47eb-97be-47f2354b3bb1`, `app_id a0000000-…-0001`):

1. Set `is_live = true` on all 75 branches.
2. For each branch, create a `branch_manager` user keyed to the branch's `email` column — silently (no invite email). You will trigger "Resend invite" per branch later when the actual staff member is ready to take over.

## Step 1 — Flip live

Single UPDATE: `is_live = true` on every branch where `tenant_id = '…3bb1'` and `is_live = false`. Expected: 75 rows.

## Step 2 — Provision branch_manager accounts (silent)

I'll write a small one-shot Node script (run locally against Supabase using the service role key — not committed to the repo) that, for each of the 75 branches:

1. **Skip if branch.email is null/empty** — log and continue.
2. **Find or create auth user** by email:
   - `auth.admin.listUsers` paged lookup, or `createUser({ email, password: <random 32-byte hex>, email_confirm: true })`.
   - If the address already has an auth user (e.g. shared `info@…` or pre-existing), reuse that user id — no overwrite.
3. **Upsert `profiles` row** (`id = user.id`, `email`, `display_name = branch.name`) — only fill blanks, never clobber.
4. **Insert `tenant_memberships`**:
   ```
   profile_id   = user.id
   tenant_id    = a513d202-…-3bb1
   app_id       = a0000000-…-0001
   role         = 'branch_manager'
   branch_id    = branch.id
   is_active    = true
   ```
   `ON CONFLICT (profile_id, tenant_id, app_id) DO NOTHING` semantics — if a membership already exists (e.g. shared email already linked elsewhere in 3@1), skip and log. The existing `Resend invite` / `Edit member` flows in `AdminUsers` will handle those edge cases.
5. **No email is sent.** The user exists with a random unknown password; later you click "Resend invite" in `/admin/users` and the existing `invite-member` flow generates a branded password-setup link.

### Why a one-shot script, not a migration or edge function

- Auth user creation must go through `auth.admin.createUser` (service role), which a SQL migration can't do.
- It's a one-time backfill — not worth a permanent edge function. Same script will be reusable for the PostNet branches (just change the tenant_id).

### Output

Script prints a summary table and writes `/mnt/documents/3at1-branch-admin-provisioning.csv` with columns: `branch_name, branch_email, profile_id, status` (`created` / `reused_existing_user` / `skipped_no_email` / `membership_exists` / `error`).

## Verification

After the script:

```sql
SELECT count(*) FROM branches
  WHERE tenant_id = 'a513d202-…-3bb1' AND is_live = true;     -- expect 75

SELECT count(*) FROM tenant_memberships
  WHERE tenant_id = 'a513d202-…-3bb1' AND role = 'branch_manager';  -- expect ≤ 75
```

Plus a spot-check on 3 branches to confirm `profiles.email = branches.email` and `tenant_memberships.branch_id` matches.

## Out of scope

- Sending the invite emails (you said create silently → invite later).
- PostNet — same script will be re-run separately with the PostNet tenant_id when you're ready.
- Any branch-level branding, capabilities, pricing, or payment-gateway overrides — they stay at tenant defaults.
- Promoting these accounts beyond `branch_manager` — they can invite their own `store_operator` staff via the existing UI.
