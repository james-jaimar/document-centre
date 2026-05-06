## Problem

The `branch_capabilities` table only has a SELECT policy for the `anon` role (public storefront reads). There is **no SELECT policy for `authenticated` users**, so branch staff (who are logged in) get zero rows back — explaining the "No product capabilities configured yet" state.

Similarly, the UPDATE policy exists but branch staff need SELECT access first to even see the data.

## Fix

**One migration** that adds an `authenticated` SELECT policy on `branch_capabilities`:

- Tenant owners/admins can read all capabilities for branches in their tenant
- Branch staff (`branch_manager`, `store_operator`) can read capabilities for their assigned branch
- This mirrors the existing UPDATE policy's access pattern

The policy will join `tenant_memberships` to verify the user belongs to the tenant that owns the branch, scoped appropriately by role.

No frontend changes needed — the hook already queries correctly, it's just getting empty results due to RLS.