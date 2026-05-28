# Branch delivery edits not persisting

## Root cause

The branch Delivery page renders fine (anyone can `SELECT` from `delivery_rates` / `delivery_zones` / `delivery_zone_locations`), but **only tenant owners/admins can write** to those tables. The current policy is:

```sql
USING / WITH CHECK:
  (scope_type='platform' AND platform_admin)
  OR (tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
```

`user_is_tenant_admin` only matches roles `owner` / `admin`. A branch manager (or any non-tenant-admin branch role) silently fails the UPDATE — Postgres reports 0 rows changed, PostgREST returns 200, the UI shows the green "Rate saved" toast, and the value reverts on refetch.

The new `tenant_delivery_method_overrides` table already has branch-scoped policies (owner/admin/branch_manager/store_operator at that branch). The three older delivery tables were never extended.

## Fix

One migration that rewrites the manage policies on **`delivery_zones`**, **`delivery_rates`**, and **`delivery_zone_locations`** so branch members can manage rows scoped to their branch.

New rule on `delivery_zones` and `delivery_rates`:

```text
platform rows  → platform_admin
tenant rows    → user_is_tenant_admin(tenant_id)             (unchanged)
branch rows    → tenant admin of tenant_id
                  OR active membership in (tenant_id, branch_id)
                  with role in (owner, admin, branch_manager, store_operator)
```

`delivery_zone_locations` mirrors the same rule by joining its parent `delivery_zones` row.

Policies are replaced atomically (DROP + CREATE) inside the migration. No table or column changes. No frontend changes needed — once the policy allows the write, the existing `saveRate` mutation persists.

## Verification

- As a Sandton branch user, edit a Standard 0–1kg price → refetch should show the new value.
- As the same user, add and delete a branch-scoped tier → both should persist.
- Tenant admin behaviour unchanged (tenant-scope edits still work; can also edit branch-scope rows for any branch under their tenant).
- Platform-scope rows still restricted to platform admins.
