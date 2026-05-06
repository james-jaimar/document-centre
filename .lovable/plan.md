## Problem

The `tenant_memberships` table has a CHECK constraint that only allows these roles: `owner`, `admin`, `sales`, `production`, `accounts`, `customer`. The UI (and edge function) try to insert `branch_manager` and `store_operator`, which the DB rejects with an error.

## Fix

**1. Database migration** — Drop and recreate the role check constraint to include the two new roles:

```sql
ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT tenant_memberships_role_check;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role = ANY (ARRAY[
    'owner', 'admin', 'sales', 'production', 'accounts', 'customer',
    'branch_manager', 'store_operator'
  ]));
```

**2. Verify** — After migration, re-test adding a branch manager via the Add Member dialog.

No code changes needed — the edge function and UI already handle these roles correctly; only the DB constraint is blocking them.
