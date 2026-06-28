## Problem

In the Branch Settings → Users tab, "Set password manually" (and likely Disable/Enable/Remove) fails when the signed-in user is a **branch manager** rather than a tenant owner/admin.

Root cause in `supabase/functions/manage-user/index.ts`:

- Authorization requires `platform_admin`, tenant `owner`/`admin`, OR an "authorised branch staff" path.
- The branch-staff path only allows `force_password_reset`, `update_profile`, `update_email`, `resend_invite` — **`set_password` is not in the allowed list**.
- It also only activates when `branch_id` is included in the request body. `BranchUsersPanel.tsx` currently sends `tenant_id` and `app_id` but **omits `branch_id`**, so the branch-staff branch never even runs.

Result: a branch manager who can see the dialog gets a `403 Forbidden` (or generic failure toast) when clicking "Set password".

## Fix

### 1. `src/components/branch/BranchUsersPanel.tsx`
Include `branch_id: branchId` in every `manageUser.mutateAsync({...})` call (set password, confirm action for disable/enable/reset/invite, and the existing remove flow). This lets the edge function evaluate the branch-staff authorisation path.

### 2. `supabase/functions/manage-user/index.ts`
Extend branch-staff authorisation so a **branch_manager** at the target's branch can manage their own staff:

- Split BRANCH_ALLOWED_ACTIONS into two tiers:
  - **Any branch staff** (existing): `force_password_reset`, `update_profile`, `update_email`, `resend_invite` — still gated to customers via `profile_belongs_to_branch`.
  - **Branch manager only**: add `set_password`, `disable_account`, `enable_account`, `remove_membership` — only when the target is a `branch_manager`/`store_operator` whose `tenant_memberships.branch_id` matches the supplied `branch_id`.
- Confirm caller's membership row has `role = 'branch_manager'` (or owner/admin, already covered) for the elevated set, and verify the target membership exists in the same `(tenant_id, app_id, branch_id)` before authorising. This keeps tenant-wide and cross-branch escalation impossible.

No DB schema change. No UI change beyond passing `branch_id`.

## Verification

- As branch_manager in Demo Branch: open Users → ⋮ on a store operator → "Set password manually" → succeeds; toast "Password updated".
- Disable / Enable / Remove also succeed for branch_manager.
- As a store_operator (non-manager): "Set password" still blocked (403).
- As tenant owner/admin: unchanged, still works.
