
-- Helper: does auth.uid() have an active branch_manager membership for the
-- same app/tenant/branch as the target staff profile?
CREATE OR REPLACE FUNCTION public.user_can_view_branch_staff_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships mgr
    JOIN public.tenant_memberships staff
      ON staff.app_id = mgr.app_id
     AND staff.tenant_id = mgr.tenant_id
     AND staff.branch_id = mgr.branch_id
    WHERE mgr.profile_id = auth.uid()
      AND mgr.is_active = true
      AND mgr.role = 'branch_manager'
      AND staff.profile_id = _profile_id
      AND staff.is_active = true
      AND staff.role IN ('branch_manager', 'store_operator')
  );
$$;

CREATE POLICY "profiles_select_branch_manager_staff"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.user_can_view_branch_staff_profile(id));
