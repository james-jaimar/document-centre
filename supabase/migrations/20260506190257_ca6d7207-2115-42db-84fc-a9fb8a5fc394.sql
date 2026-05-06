CREATE POLICY "branch_capabilities_authenticated_read"
ON public.branch_capabilities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    JOIN public.branches b ON b.tenant_id = tm.tenant_id
    WHERE b.id = branch_capabilities.branch_id
      AND tm.profile_id = auth.uid()
  )
);