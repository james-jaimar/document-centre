CREATE OR REPLACE FUNCTION public.company_account_summary(
  p_tenant_id uuid,
  p_app_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(
  company_id uuid,
  balance numeric,
  overdue numeric,
  last_order_at timestamptz,
  total_spend numeric,
  order_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_staff_for_tenant(p_app_id, p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised for tenant %', p_tenant_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH comps AS (
    SELECT c.id
    FROM public.customer_companies c
    WHERE c.tenant_id = p_tenant_id
      AND c.app_id = p_app_id
      AND (p_branch_id IS NULL OR c.branch_id = p_branch_id OR c.branch_id IS NULL)
  ),
  led AS (
    SELECT l.company_id AS cid,
           COALESCE(SUM(l.amount), 0) AS bal,
           COALESCE(SUM(l.amount) FILTER (
             WHERE l.entry_type = 'charge' AND l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE
           ), 0) AS od
    FROM public.customer_account_ledger l
    WHERE l.tenant_id = p_tenant_id AND l.company_id IS NOT NULL
    GROUP BY l.company_id
  ),
  ord AS (
    SELECT tm.company_id AS cid,
           MAX(COALESCE(o.submitted_at, o.created_at)) AS last_at,
           COALESCE(SUM(o.total_amount), 0) AS spend,
           COUNT(*)::bigint AS cnt
    FROM public.tenant_memberships tm
    JOIN public.orders o
      ON o.user_id = tm.profile_id
     AND o.tenant_id = p_tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.company_id IS NOT NULL
      AND o.order_status NOT IN ('cart', 'draft', 'cancelled')
    GROUP BY tm.company_id
  )
  SELECT comps.id,
         COALESCE(led.bal, 0),
         COALESCE(led.od, 0),
         ord.last_at,
         COALESCE(ord.spend, 0),
         COALESCE(ord.cnt, 0)
  FROM comps
  LEFT JOIN led ON led.cid = comps.id
  LEFT JOIN ord ON ord.cid = comps.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.company_account_summary(uuid, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.company_account_summary(uuid, uuid, uuid) TO authenticated, service_role;