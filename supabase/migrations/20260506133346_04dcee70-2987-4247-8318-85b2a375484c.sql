
CREATE OR REPLACE FUNCTION public.user_is_staff_for(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','sales','production','accounts',
                        'branch_manager','store_operator')
    )
  );
$$;
