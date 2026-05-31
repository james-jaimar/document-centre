CREATE OR REPLACE FUNCTION public.user_is_branch_manager(p_app_id uuid, p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = auth.uid()
      AND app_id = p_app_id
      AND tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active = true
      AND role = 'branch_manager'
  );
$$;

CREATE POLICY "tenant_memberships_select_branch_manager"
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (public.user_is_branch_manager(app_id, tenant_id, branch_id));