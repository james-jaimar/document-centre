# Fix branch locale save for platform administrators

## Verified cause

- The signed-in user is a `platform_admin` and is viewing **Document Centre Demo → Demo Branch** through the platform tenant override.
- `BranchRegionalCard` writes the selected measurement system directly to `branch_settings`.
- The current `branch_settings` write policy only permits tenant membership roles `owner`, `admin`, or branch-scoped `branch_manager`; it does not permit `platform_admin`, so the insert is rejected by row-level security.
- The existing `user_can_manage_branch(branch_id)` security helper already correctly permits platform admins, tenant admins, and the branch's manager. The catalogue resync function uses the equivalent authorization model, so the failure occurs before resync.

## Change

1. Replace the `branch_settings` management policy with one based on `user_can_manage_branch(branch_id)` for both existing-row access and new/updated-row validation.
2. Keep public read access limited to non-sensitive branch settings and leave tenant-member read access unchanged.
3. Verify that the platform admin can save **Metric** for Demo Branch and that the resulting `regional.measurement_unit` row has the matching tenant and branch IDs.
4. Verify the automatic branch catalogue resync succeeds and the resolved unit system returns `metric`.
5. Run the Supabase linter and check the relevant UI flow for regressions.

## Technical scope

- Database policy migration only; no schema or UI redesign is required.
- This aligns `branch_settings` with other branch-managed tables that already use `user_can_manage_branch`.
