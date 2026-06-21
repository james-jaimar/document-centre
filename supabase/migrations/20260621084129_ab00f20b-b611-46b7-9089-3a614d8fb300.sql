DROP POLICY IF EXISTS "Branch managers can update own capabilities" ON public.branch_capabilities;
DROP POLICY IF EXISTS "Branch managers can view own capabilities" ON public.branch_capabilities;

CREATE POLICY "Branch staff can view own capabilities"
ON public.branch_capabilities
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM branches b
    JOIN tenant_memberships tm ON tm.tenant_id = b.tenant_id
    WHERE b.id = branch_capabilities.branch_id
      AND tm.profile_id = auth.uid()
      AND tm.is_active = true
  )
);

CREATE POLICY "Branch staff can update own capabilities"
ON public.branch_capabilities
FOR UPDATE
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM branches b
    JOIN tenant_memberships tm ON tm.tenant_id = b.tenant_id
    WHERE b.id = branch_capabilities.branch_id
      AND tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND (
        tm.role = ANY (ARRAY['owner','admin'])
        OR (tm.role = ANY (ARRAY['branch_manager','store_operator']) AND tm.branch_id = b.id)
      )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM branches b
    JOIN tenant_memberships tm ON tm.tenant_id = b.tenant_id
    WHERE b.id = branch_capabilities.branch_id
      AND tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND (
        tm.role = ANY (ARRAY['owner','admin'])
        OR (tm.role = ANY (ARRAY['branch_manager','store_operator']) AND tm.branch_id = b.id)
      )
  )
);