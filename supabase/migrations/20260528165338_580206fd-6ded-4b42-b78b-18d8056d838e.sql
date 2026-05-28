-- Branch-level delivery method overrides
ALTER TABLE public.tenant_delivery_method_overrides
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.tenant_delivery_method_overrides
  DROP CONSTRAINT IF EXISTS tenant_delivery_method_overrides_pkey;

ALTER TABLE public.tenant_delivery_method_overrides
  ADD CONSTRAINT tenant_delivery_method_overrides_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS tdm_overrides_tenant_unique
  ON public.tenant_delivery_method_overrides (tenant_id, method_id)
  WHERE branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tdm_overrides_branch_unique
  ON public.tenant_delivery_method_overrides (tenant_id, branch_id, method_id)
  WHERE branch_id IS NOT NULL;

-- RLS: allow branch managers/store operators (and tenant admins) to manage branch-scoped rows
DROP POLICY IF EXISTS "Tenant admins manage method overrides - insert" ON public.tenant_delivery_method_overrides;
DROP POLICY IF EXISTS "Tenant admins manage method overrides - update" ON public.tenant_delivery_method_overrides;
DROP POLICY IF EXISTS "Tenant admins manage method overrides - delete" ON public.tenant_delivery_method_overrides;

CREATE POLICY "Manage method overrides - insert"
ON public.tenant_delivery_method_overrides
FOR INSERT TO authenticated
WITH CHECK (
  public.user_is_tenant_admin(tenant_id)
  OR (
    branch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id = tenant_delivery_method_overrides.tenant_id
        AND tm.branch_id = tenant_delivery_method_overrides.branch_id
        AND tm.role IN ('owner','admin','branch_manager','store_operator')
    )
  )
);

CREATE POLICY "Manage method overrides - update"
ON public.tenant_delivery_method_overrides
FOR UPDATE TO authenticated
USING (
  public.user_is_tenant_admin(tenant_id)
  OR (
    branch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id = tenant_delivery_method_overrides.tenant_id
        AND tm.branch_id = tenant_delivery_method_overrides.branch_id
        AND tm.role IN ('owner','admin','branch_manager','store_operator')
    )
  )
);

CREATE POLICY "Manage method overrides - delete"
ON public.tenant_delivery_method_overrides
FOR DELETE TO authenticated
USING (
  public.user_is_tenant_admin(tenant_id)
  OR (
    branch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id = tenant_delivery_method_overrides.tenant_id
        AND tm.branch_id = tenant_delivery_method_overrides.branch_id
        AND tm.role IN ('owner','admin','branch_manager','store_operator')
    )
  )
);

-- Rewrite quote_delivery_rate to apply branch override > tenant override > default
CREATE OR REPLACE FUNCTION public.quote_delivery_rate(
  p_tenant_id uuid, p_branch_id uuid, p_zone_id uuid, p_method_id uuid,
  p_billable_kg numeric, p_currency text DEFAULT 'ZAR'::text
)
RETURNS TABLE(rate_id uuid, method_id uuid, zone_id uuid, price numeric, currency_code text, min_weight_kg numeric, max_weight_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT r.*,
      CASE
        WHEN r.scope_type = 'branch' AND r.branch_id = p_branch_id THEN 1
        WHEN r.scope_type = 'tenant' AND r.tenant_id = p_tenant_id AND r.branch_id IS NULL THEN 2
        WHEN r.scope_type = 'platform' THEN 3 ELSE 99 END AS scope_rank,
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
      AND r.currency_code = COALESCE(p_currency,'ZAR')
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
  ORDER BY scope_rank ASC, price ASC LIMIT 1;
$function$;

-- Extend clone_tenant_delivery_to_branch to also seed branch-scoped override rows
CREATE OR REPLACE FUNCTION public.clone_tenant_delivery_to_branch(p_branch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_old uuid; v_new uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Branch % has no tenant', p_branch_id; END IF;

  FOR v_old IN SELECT id FROM public.delivery_zones
    WHERE scope_type = 'tenant' AND tenant_id = v_tenant AND branch_id IS NULL
  LOOP
    INSERT INTO public.delivery_zones
      (scope_type, tenant_id, branch_id, code, label, description, is_default_fallback, sort_order, is_active)
    SELECT 'branch'::delivery_scope, v_tenant, p_branch_id, code, label, description, is_default_fallback, sort_order, is_active
    FROM public.delivery_zones WHERE id = v_old
    ON CONFLICT (scope_type, tenant_id, branch_id, code) DO NOTHING
    RETURNING id INTO v_new;

    IF v_new IS NULL THEN
      SELECT id INTO v_new FROM public.delivery_zones
      WHERE scope_type = 'branch' AND branch_id = p_branch_id
        AND code = (SELECT code FROM public.delivery_zones WHERE id = v_old);
    END IF;

    INSERT INTO public.delivery_zone_locations (zone_id, match_type, value, country)
    SELECT v_new, match_type, value, country FROM public.delivery_zone_locations WHERE zone_id = v_old;

    INSERT INTO public.delivery_rates
      (scope_type, tenant_id, branch_id, zone_id, method_id, min_weight_kg, max_weight_kg, price, currency_code, is_active, sort_order)
    SELECT 'branch'::delivery_scope, v_tenant, p_branch_id, v_new, method_id, min_weight_kg, max_weight_kg, price, currency_code, is_active, sort_order
    FROM public.delivery_rates WHERE scope_type = 'tenant' AND tenant_id = v_tenant AND zone_id = v_old;
  END LOOP;

  -- Seed branch-scoped method override rows from tenant-level overrides
  INSERT INTO public.tenant_delivery_method_overrides (tenant_id, branch_id, method_id, is_enabled)
  SELECT v_tenant, p_branch_id, o.method_id, o.is_enabled
  FROM public.tenant_delivery_method_overrides o
  WHERE o.tenant_id = v_tenant AND o.branch_id IS NULL
  ON CONFLICT DO NOTHING;
END;
$function$;