CREATE OR REPLACE FUNCTION public.enable_family_for_tenant_branches(
  p_tenant_id uuid,
  p_product_family_id uuid,
  p_only_untouched boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to manage capabilities for this tenant';
  END IF;

  INSERT INTO public.branch_capabilities (branch_id, product_family_id, is_enabled)
  SELECT b.id, p_product_family_id, true
  FROM public.branches b
  WHERE b.tenant_id = p_tenant_id
    AND b.is_active = true
  ON CONFLICT (branch_id, product_family_id) DO NOTHING;

  UPDATE public.branch_capabilities bc
  SET is_enabled = true
  FROM public.branches b
  WHERE b.id = bc.branch_id
    AND b.tenant_id = p_tenant_id
    AND b.is_active = true
    AND bc.product_family_id = p_product_family_id
    AND bc.is_enabled = false
    AND (p_only_untouched = false OR bc.updated_at = bc.created_at);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_family_for_tenant_branches(uuid, uuid, boolean) TO authenticated;