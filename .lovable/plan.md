## The bug (reproduced)

When you deleted the old demo branch and recreated `demo3new` with the same email (`james_b_hawkins@icloud.com`), the activation flow left you with a **branch_manager membership that has `branch_id = NULL`** — so the branch portal correctly says "No branch is assigned to your account".

Root cause chain:

1. `tenant_memberships.branch_id` FK is `ON DELETE SET NULL` (verified in schema).
2. Deleting the previous demo branch nulled the `branch_id` on your existing membership row but left the row itself intact.
3. `supabase/functions/_shared/sendBranchActivation.ts` (lines 132–141) checks for **any** membership matching `(profile_id, tenant_id, app_id)` and skips the insert when one exists — it never looks at `branch_id`.
4. So `demo3new` was never linked. Login → no branch.

DB confirms one row: `role=branch_manager, branch_id=NULL, is_active=true`.

## Fix

**1. `supabase/functions/_shared/sendBranchActivation.ts` — make membership reconciliation branch-aware**

Replace the current "if no membership, insert" block with:

- Load all memberships for `(profile_id, tenant_id, app_id)`.
- If one already points to this `branchId` → do nothing.
- Else if an orphaned `branch_manager` row exists with `branch_id IS NULL` → `UPDATE` it to set `branch_id = branchId`, `is_active = true` (adopt the orphan; covers the delete/recreate case and any manual cleanup).
- Else → `INSERT` a new `branch_manager` membership for this branch (supports one user managing multiple branches).

This is the whole functional fix — it repairs the user's account on the next activation send and prevents recurrence for the 500-branch rollout.

**2. `supabase/functions/provision-branch-admins/index.ts` — same reconciliation**

The bulk provisioner has the identical check (lines 147–164) and needs the same three-way logic so a re-run heals orphans instead of reporting `membership_exists` and moving on.

**3. One-shot repair for existing orphans (optional but recommended before you fan out)**

Add a small SQL migration that, for every `tenant_memberships` row where `role='branch_manager' AND branch_id IS NULL`, tries to relink it to a branch in the same tenant whose `email` matches the profile's email (case-insensitive). Rows with no match are left alone and surfaced via a `SELECT` in the migration description so you can review them. No destructive deletes.

## Out of scope

- Auth flow, reset-password page, email template/logo, tracking URL host — all unchanged.
- No FK change: `ON DELETE SET NULL` stays (a hard delete + cascade would silently drop legitimate multi-branch managers).
- No new tables or RLS changes.

## Verification

- Re-run activation for `demo3new` → the existing NULL-branch row gets adopted, sign in shows the branch.
- Delete a branch, recreate with same email, re-send activation → new branch is linked automatically.
- Send activation for a second branch to the same email → a second membership row is inserted (multi-branch manager works).
