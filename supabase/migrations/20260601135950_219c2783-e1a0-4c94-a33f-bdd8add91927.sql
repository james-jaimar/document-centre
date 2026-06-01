CREATE OR REPLACE FUNCTION public.apply_tenant_plan_to_branches(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_t record;
  v_base_price numeric;
  v_effective_price numeric;
  v_billing text;
  v_status text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_tenant_admin(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to apply tenant plan';
  END IF;

  SELECT assigned_plan_slug, assigned_region_id, assigned_discount_type,
         assigned_discount_value, assigned_trial_days
  INTO v_t
  FROM public.tenants WHERE id = p_tenant_id;

  IF v_t.assigned_plan_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant has no assigned plan';
  END IF;

  -- Resolve plan base price (prefer matching region, fall back to any region row)
  SELECT price INTO v_base_price
  FROM public.platform_pricing_plans
  WHERE plan_slug = v_t.assigned_plan_slug
    AND (v_t.assigned_region_id IS NULL OR region_id = v_t.assigned_region_id)
  ORDER BY (region_id = v_t.assigned_region_id) DESC NULLS LAST
  LIMIT 1;

  v_base_price := COALESCE(v_base_price, 0);
  v_effective_price := v_base_price;

  IF v_t.assigned_discount_value IS NOT NULL AND v_t.assigned_discount_value > 0 THEN
    IF v_t.assigned_discount_type = 'percentage' THEN
      v_effective_price := v_base_price * (1 - v_t.assigned_discount_value / 100.0);
    ELSIF v_t.assigned_discount_type = 'fixed_amount' THEN
      v_effective_price := GREATEST(0, v_base_price - v_t.assigned_discount_value);
    END IF;
  END IF;

  IF v_effective_price <= 0 THEN
    v_billing := 'free';
    v_status := 'active';
  ELSE
    v_billing := 'pending_payment';
    v_status := 'incomplete';
  END IF;

  WITH up AS (
    INSERT INTO public.branch_subscriptions
      (branch_id, tenant_id, region_id, assigned_plan_slug, assigned_at, assigned_by,
       discount_type, discount_value, trial_days, billing_status, status)
    SELECT b.id, b.tenant_id, v_t.assigned_region_id, v_t.assigned_plan_slug, now(), auth.uid(),
           v_t.assigned_discount_type, v_t.assigned_discount_value, v_t.assigned_trial_days,
           v_billing, v_status
    FROM public.branches b
    WHERE b.tenant_id = p_tenant_id AND b.is_active = true
    ON CONFLICT (branch_id) DO UPDATE SET
      assigned_plan_slug = EXCLUDED.assigned_plan_slug,
      region_id = EXCLUDED.region_id,
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      trial_days = EXCLUDED.trial_days,
      billing_status = EXCLUDED.billing_status,
      status = EXCLUDED.status,
      assigned_at = now(),
      assigned_by = auth.uid(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM up;

  UPDATE public.tenants
  SET plan_assigned_at = now(), plan_assigned_by = auth.uid()
  WHERE id = p_tenant_id;

  RETURN v_count;
END;
$function$;

-- Backfill: any branch subscription whose plan is effectively free should be marked free/active
UPDATE public.branch_subscriptions bs
SET billing_status = 'free', status = 'active', updated_at = now()
FROM public.platform_pricing_plans p
WHERE bs.assigned_plan_slug = p.plan_slug
  AND (bs.region_id = p.region_id OR bs.region_id IS NULL)
  AND p.price = 0
  AND COALESCE(bs.billing_status, '') <> 'free';

-- Also backfill 100% discounted rows
UPDATE public.branch_subscriptions bs
SET billing_status = 'free', status = 'active', updated_at = now()
WHERE bs.discount_type = 'percentage'
  AND bs.discount_value >= 100
  AND COALESCE(bs.billing_status, '') <> 'free';