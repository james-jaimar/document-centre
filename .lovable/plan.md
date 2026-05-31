## Problem

The Branch Settings → Users tab is empty for newly invited store operators because RLS on `tenant_memberships` hides them from `branch_manager` users. Only `owner` / `admin` roles can see other members; everyone else can only see their own row. The data is correct — the row exists, has the right `branch_id`, role, and `is_active = true`.

## Fix

Add a SECURITY DEFINER helper and a new SELECT policy that lets a branch manager read memberships scoped to the branch they manage.

### Migration

1. Create `public.user_is_branch_manager(p_app_id uuid, p_tenant_id uuid, p_branch_id uuid)` — `STABLE SECURITY DEFINER`, `SET search_path = public`. Returns true when `auth.uid()` has an active `branch_manager` membership for the same app/tenant/branch.
2. Add policy `tenant_memberships_select_branch_manager` on `public.tenant_memberships` FOR SELECT TO authenticated USING `user_is_branch_manager(app_id, tenant_id, branch_id)`.

No changes to insert/update/delete policies — invites already go through the `invite-member` Edge Function (service role), and removal/disable for branch staff is also handled via Edge Functions. Branch managers still can't escalate roles or touch other branches.

### Verify

- As `sandtoncityadmin@postnet.co.za`, Branch Settings → Users should list both the Branch Manager and `Sandton City Staff 1`.
- Switching branch context to another branch should not leak that branch's staff.
- Tenant-level Users & Roles (admin view) continues to work unchanged.

### Out of scope

No UI changes, no changes to `useTenantMembers`, no changes to the invite flow.
