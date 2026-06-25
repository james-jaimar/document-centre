## Problem

Clicking **Remove from branch** in the Branch Staff panel shows a "Removed from branch" toast but the membership is still in the database (verified: `sandtonstaff1@postnet.co.za` still has an active `store_operator` row on the Sandton City branch).

Root cause: `BranchUsersPanel` calls `useDeleteTenantMember`, which runs a direct `supabase.from("tenant_memberships").delete().eq("id", …)` from the browser. RLS silently filters the row out (no rows deleted, no error returned), so the UI thinks it succeeded.

The codebase already has the correct path: the `manage-user` edge function exposes a `remove_membership` action that runs with the service role and writes to `user_admin_audit`. The Platform Users page uses it; the Branch Staff panel does not.

## Fix

Route the branch-staff remove action through `manage-user` instead of the direct table delete.

In `src/components/branch/BranchUsersPanel.tsx` → `handleRemove`:

- Replace `deleteMember.mutateAsync(removeTarget.id)` with
  `manageUser.mutateAsync({ action: "remove_membership", target_profile_id: removeTarget.profile_id, tenant_id: removeTarget.tenant_id, app_id: removeTarget.app_id, membership_id: removeTarget.id })`.
- Invalidate the `["tenant-members"]` query on success so the row disappears from the table.
- Drop the now-unused `useDeleteTenantMember` import.

No backend, schema, or RLS changes needed — `manage-user` already authorises tenant owners/admins and platform admins for this action.

## Cleanup of the stuck row

After the fix is in, remove the lingering membership for `sandtonstaff1@postnet.co.za` (membership id `8e944c2d-2db3-4ebe-863a-cd6e3004abf3`) via a one-shot data delete so the Sandton City branch starts clean.

## Out of scope

- I won't touch the Tenant-level Members page or other callers of `useDeleteTenantMember` in this change — they may have the same silent-failure issue, but you didn't report a problem there. Happy to audit them next if you want.