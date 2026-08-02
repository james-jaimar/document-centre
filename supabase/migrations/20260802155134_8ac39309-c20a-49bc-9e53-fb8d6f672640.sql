CREATE OR REPLACE FUNCTION public.quote_delivery_rate(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_zone_id uuid,
  p_method_id uuid,
  p_billable_kg numeric,
  p_currency text DEFAULT 'ZAR'::text
)
RETURNS TABLE(rate_id uuid, method_id uuid, zone_id uuid, price numeric, currency_code text, min_weight_kg numeric, max_weight_kg numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT r.*,
      CASE
        WHEN r.scope_type = 'branch' AND r.branch_id = p_branch_id THEN 1
        WHEN r.scope_type = 'tenant' AND r.tenant_id = p_tenant_id AND r.branch_id IS NULL THEN 2
        WHEN r.scope_type = 'platform' THEN 3 ELSE 99 END AS scope_rank,
      -- Native currency rows win outright; base-currency rows are a fallback
      -- that the caller converts for display.
      CASE WHEN r.currency_code = COALESCE(p_currency,'ZAR') THEN 0 ELSE 1 END AS currency_rank,
      COALESCE(
        (SELECT o.is_enabled FROM public.tenant_delivery_method_overrides o
          WHERE o.tenant_id = p_tenant_id AND o.method_id = m.id AND o.branch_id = p_branch_id LIMIT 1),
        (SELECT o.is_enabled FROM public.tenant_delivery_method_overrides o
          WHERE o.tenant_id = p_tenant_id AND o.method_id = m.id AND o.branch_id IS NULL LIMIT 1),
        true
      ) AS effective_enabled
    FROM public.delivery_rates r
    JOIN public.delivery_methods m ON m.id = r.method_id
    WHERE r.is_active AND r.zone_id = p_zone_id
      AND r.currency_code IN (COALESCE(p_currency,'ZAR'), 'ZAR')
      AND m.is_active
      AND (
        (p_method_id IS NOT NULL AND r.method_id = p_method_id)
        OR (p_method_id IS NULL AND m.fulfillment_kind = 'shipping')
      )
      AND p_billable_kg >= r.min_weight_kg
      AND (r.max_weight_kg IS NULL OR p_billable_kg <= r.max_weight_kg)
  )
  SELECT id, method_id, zone_id, price, currency_code, min_weight_kg, max_weight_kg
  FROM candidates
  WHERE effective_enabled = true
  ORDER BY currency_rank ASC, scope_rank ASC, price ASC LIMIT 1;
$function$;