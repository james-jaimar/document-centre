CREATE OR REPLACE FUNCTION public.mark_order_opened(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = v_tenant
      AND coalesce(tm.is_active, true)
      AND tm.role <> 'customer'
  ) AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET first_opened_at = now(),
      first_opened_by = auth.uid()
  WHERE id = p_order_id
    AND first_opened_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_order_opened(uuid) TO authenticated;