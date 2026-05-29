
-- Helper: caller can manage a given branch (platform admin, tenant admin, or active branch_manager of that branch)
CREATE OR REPLACE FUNCTION public.user_can_manage_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id AND public.user_is_tenant_admin(b.tenant_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = p_branch_id
        AND tm.role = 'branch_manager'
    )
  );
$$;

-- ===== email_accounts: branch_manager CRUD on their own branch's rows =====
DROP POLICY IF EXISTS email_accounts_select_branch_manager ON public.email_accounts;
CREATE POLICY email_accounts_select_branch_manager ON public.email_accounts
  FOR SELECT
  USING (branch_id IS NOT NULL AND public.user_can_manage_branch(branch_id));

DROP POLICY IF EXISTS email_accounts_insert_branch_manager ON public.email_accounts;
CREATE POLICY email_accounts_insert_branch_manager ON public.email_accounts
  FOR INSERT
  WITH CHECK (branch_id IS NOT NULL AND public.user_can_manage_branch(branch_id));

DROP POLICY IF EXISTS email_accounts_update_branch_manager ON public.email_accounts;
CREATE POLICY email_accounts_update_branch_manager ON public.email_accounts
  FOR UPDATE
  USING (branch_id IS NOT NULL AND public.user_can_manage_branch(branch_id))
  WITH CHECK (branch_id IS NOT NULL AND public.user_can_manage_branch(branch_id));

DROP POLICY IF EXISTS email_accounts_delete_branch_manager ON public.email_accounts;
CREATE POLICY email_accounts_delete_branch_manager ON public.email_accounts
  FOR DELETE
  USING (branch_id IS NOT NULL AND public.user_can_manage_branch(branch_id));

-- ===== branch_payment_gateways: add branch_manager policy alongside existing tenant_admin/platform_admin =====
DROP POLICY IF EXISTS bpg_branch_manager_all ON public.branch_payment_gateways;
CREATE POLICY bpg_branch_manager_all ON public.branch_payment_gateways
  FOR ALL
  USING (public.user_can_manage_branch(branch_id))
  WITH CHECK (public.user_can_manage_branch(branch_id));
