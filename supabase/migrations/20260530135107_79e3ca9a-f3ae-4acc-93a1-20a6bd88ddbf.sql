DROP POLICY IF EXISTS "Admins can manage branch settings" ON public.branch_settings;

CREATE POLICY "Admins and branch managers can manage branch settings"
  ON public.branch_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
        AND (
          (m.role IN ('owner', 'admin') AND (m.branch_id IS NULL OR m.branch_id = branch_settings.branch_id))
          OR (m.role = 'branch_manager' AND m.branch_id = branch_settings.branch_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
        AND (
          (m.role IN ('owner', 'admin') AND (m.branch_id IS NULL OR m.branch_id = branch_settings.branch_id))
          OR (m.role = 'branch_manager' AND m.branch_id = branch_settings.branch_id)
        )
    )
  );