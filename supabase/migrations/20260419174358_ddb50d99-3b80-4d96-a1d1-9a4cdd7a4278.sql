-- Add branch_id to pricing_rules for per-branch overrides
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS pricing_rules_branch_id_idx ON public.pricing_rules(branch_id);
CREATE INDEX IF NOT EXISTS pricing_rules_tenant_branch_idx ON public.pricing_rules(tenant_id, branch_id);

-- New RLS: branch staff can manage their own branch's pricing overrides
DROP POLICY IF EXISTS "Branch staff can manage own pricing overrides" ON public.pricing_rules;
CREATE POLICY "Branch staff can manage own pricing overrides"
  ON public.pricing_rules
  FOR ALL
  USING (
    branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = pricing_rules.branch_id
        AND tm.role IN ('branch_manager', 'store_operator', 'owner', 'admin')
    )
  )
  WITH CHECK (
    branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = pricing_rules.branch_id
        AND tm.role IN ('branch_manager', 'store_operator', 'owner', 'admin')
    )
  );

-- Tenant owners/admins via membership (covers users without legacy head_office_admin role)
DROP POLICY IF EXISTS "Tenant admins can manage tenant pricing" ON public.pricing_rules;
CREATE POLICY "Tenant admins can manage tenant pricing"
  ON public.pricing_rules
  FOR ALL
  USING (
    tenant_id IS NOT NULL
    AND user_is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND user_is_tenant_admin(tenant_id)
  );