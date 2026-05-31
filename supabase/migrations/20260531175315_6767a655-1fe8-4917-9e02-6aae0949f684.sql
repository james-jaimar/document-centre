CREATE OR REPLACE FUNCTION public.get_branch_customers(_branch_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, first_name text, last_name text, email text, phone text, order_count bigint, total_spent numeric, last_order_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.caller_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for branch %', _branch_id USING ERRCODE = '42501';
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
  ),
  quote_profiles AS (
    SELECT DISTINCT q.created_by_profile_id AS profile_id
    FROM public.quotes q
    WHERE q.branch_id = _branch_id
      AND q.created_by_profile_id IS NOT NULL
  ),
  all_profiles AS (
    SELECT profile_id FROM order_stats
    UNION
    SELECT profile_id FROM quote_profiles
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    COALESCE(os.order_count, 0)::bigint,
    COALESCE(os.total_spent, 0)::numeric,
    os.last_order_at
  FROM all_profiles ap
  JOIN public.profiles p ON p.id = ap.profile_id
  LEFT JOIN order_stats os ON os.profile_id = ap.profile_id
  ORDER BY os.last_order_at DESC NULLS LAST;
END;
$function$;