ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT tenant_memberships_role_check;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role = ANY (ARRAY[
    'owner', 'admin', 'sales', 'production', 'accounts', 'customer',
    'branch_manager', 'store_operator'
  ]));