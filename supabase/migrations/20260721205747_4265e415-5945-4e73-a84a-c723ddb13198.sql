
CREATE OR REPLACE FUNCTION public.get_tenant_customers_for_branch(_branch_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, first_name text, last_name text, email text, phone text, order_count bigint, total_spent numeric, last_order_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _tenant_id uuid;
  _app_id uuid;
BEGIN
  IF NOT public.caller_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for branch %', _branch_id USING ERRCODE = '42501';
  END IF;

  SELECT b.tenant_id, t.app_id
    INTO _tenant_id, _app_id
  FROM public.branches b
  JOIN public.tenants t ON t.id = b.tenant_id
  WHERE b.id = _branch_id;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH order_stats AS (
    SELECT
      o.ordered_by_profile_id AS profile_id,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(o.total_amount), 0)::numeric AS total_spent,
      MAX(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE o.branch_id = _branch_id
      AND o.order_status <> 'cart'
      AND o.ordered_by_profile_id IS NOT NULL
    GROUP BY o.ordered_by_profile_id
  )
  SELECT DISTINCT
    p.id AS profile_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    COALESCE(s.order_count, 0)::bigint AS order_count,
    COALESCE(s.total_spent, 0)::numeric AS total_spent,
    s.last_order_at
  FROM public.tenant_memberships m
  JOIN public.profiles p ON p.id = m.profile_id
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN order_stats s ON s.profile_id = p.id
  WHERE m.tenant_id = _tenant_id
    AND (m.app_id = _app_id OR _app_id IS NULL)
    AND m.is_active
    AND m.role = 'customer'
    AND COALESCE(u.is_anonymous, false) = false
    AND p.email IS NOT NULL
  ORDER BY s.last_order_at DESC NULLS LAST, p.display_name NULLS LAST;
END;
$function$;
