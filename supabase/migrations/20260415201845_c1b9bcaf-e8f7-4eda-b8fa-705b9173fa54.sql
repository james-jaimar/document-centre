
-- Allow branch managers to update capabilities for their own branch
CREATE POLICY "Branch managers can update own capabilities"
ON public.branch_capabilities
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    JOIN public.branches b ON b.id = branch_capabilities.branch_id
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = b.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('branch_manager', 'store_operator')
        AND ur.branch_id = branch_capabilities.branch_id
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    JOIN public.branches b ON b.id = branch_capabilities.branch_id
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = b.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('branch_manager', 'store_operator')
        AND ur.branch_id = branch_capabilities.branch_id
    )
  )
);

-- Function to seed branch capabilities for all active product families
CREATE OR REPLACE FUNCTION public.seed_branch_capabilities(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.branch_capabilities (branch_id, product_family_id, is_enabled)
  SELECT p_branch_id, pf.id, true
  FROM public.product_families pf
  WHERE pf.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.branch_capabilities bc
      WHERE bc.branch_id = p_branch_id AND bc.product_family_id = pf.id
    );
END;
$$;
