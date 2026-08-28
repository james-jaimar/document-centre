CREATE OR REPLACE FUNCTION public.user_is_staff_for_tenant(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

DROP POLICY IF EXISTS customer_companies_staff_all ON public.customer_companies;

CREATE POLICY customer_companies_staff_all ON public.customer_companies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    CASE WHEN branch_id IS NULL
      THEN public.user_is_staff_for_tenant(app_id, tenant_id)
      ELSE public.user_is_staff_for_branch(app_id, tenant_id, branch_id)
    END
  )
  WITH CHECK (
    CASE WHEN branch_id IS NULL
      THEN public.user_is_staff_for_tenant(app_id, tenant_id)
      ELSE public.user_is_staff_for_branch(app_id, tenant_id, branch_id)
    END
  );