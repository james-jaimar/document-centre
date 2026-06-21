CREATE OR REPLACE FUNCTION public.user_can_manage_branch_catalog(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.branches b ON b.id = p_branch_id
    WHERE m.profile_id = auth.uid()
      AND m.is_active
      AND m.tenant_id = b.tenant_id
      AND (
        (m.branch_id IS NULL  AND m.role IN ('owner','admin'))
     OR (m.branch_id = p_branch_id AND m.role IN ('owner','admin','branch_manager'))
      )
  ) OR public.has_role(auth.uid(), 'platform_admin'::app_role);
$$;