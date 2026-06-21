## Problem

Toggling a product on `/branch/products` fails with **"Cannot coerce the result to a single JSON object"**.

Root cause: the `UPDATE` RLS policy on `public.branch_capabilities` only allows tenant_memberships with role `owner`/`admin`, or the legacy `user_roles` table entries for `branch_manager`/`store_operator`. The signed-in user `hello@printmypics.co` has a `tenant_memberships` row with `role = 'branch_manager'` (branch-scoped) — so the update is silently blocked by RLS, returns 0 rows, and `.single()` throws.

This contradicts project memory: roles live in `tenant_memberships`, not `user_roles`.

## Fix

One database migration that replaces the two branch-manager policies on `public.branch_capabilities` (`Branch managers can update own capabilities` and `Branch managers can view own capabilities`) with versions that use the same `tenant_memberships` pattern already in use on `branch_product_option_overrides`:

- `SELECT`: any active tenant member of the branch's tenant.
- `UPDATE` (USING + WITH CHECK): platform admin OR active tenant_memberships row where
  - `role IN ('owner','admin')` for the branch's tenant, OR
  - `role IN ('branch_manager','store_operator')` AND `tm.branch_id = branch_capabilities.branch_id`.

The other existing policies (platform admin, head office admin, storefront read) are left untouched.

No frontend changes — once the policy permits the update, the existing toggle flow works.

## Verification

After the migration runs:
1. Sign in as the branch manager, go to Products, toggle Ring Binders off → toggle persists, no toast error.
2. Toggle it back on → still works.
3. Confirm other branches/tenants are unaffected (admins and platform admins keep full access; storefront read still requires `is_enabled = true`).