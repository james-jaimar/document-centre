-- Remove duplicate 'customer' tenant_memberships when a staff role exists
DELETE FROM public.tenant_memberships c
WHERE c.role = 'customer'
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships s
    WHERE s.profile_id = c.profile_id
      AND s.tenant_id = c.tenant_id
      AND s.app_id = c.app_id
      AND s.role IN ('owner','admin','sales','production','accounts','branch_manager','store_operator')
  );