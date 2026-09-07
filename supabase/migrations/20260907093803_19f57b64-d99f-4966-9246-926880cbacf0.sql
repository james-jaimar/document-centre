CREATE POLICY "Tenant admins read shared templates"
ON public.platform_email_templates
FOR SELECT
TO authenticated
USING (
  tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.profile_id = auth.uid()
      AND m.is_active = true
      AND m.role IN ('owner', 'admin')
  )
);