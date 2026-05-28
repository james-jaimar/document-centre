-- 1. Per-tenant enable/disable for delivery methods
CREATE TABLE IF NOT EXISTS public.tenant_delivery_method_overrides (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  method_id uuid NOT NULL REFERENCES public.delivery_methods(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, method_id)
);

GRANT SELECT ON public.tenant_delivery_method_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_delivery_method_overrides TO authenticated;
GRANT ALL ON public.tenant_delivery_method_overrides TO service_role;

ALTER TABLE public.tenant_delivery_method_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read method overrides"
  ON public.tenant_delivery_method_overrides FOR SELECT
  USING (true);

CREATE POLICY "Tenant admins manage method overrides - insert"
  ON public.tenant_delivery_method_overrides FOR INSERT
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins manage method overrides - update"
  ON public.tenant_delivery_method_overrides FOR UPDATE
  USING (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins manage method overrides - delete"
  ON public.tenant_delivery_method_overrides FOR DELETE
  USING (public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER trg_tdmo_updated_at
  BEFORE UPDATE ON public.tenant_delivery_method_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Zone resolver: scope-first (branch -> tenant -> platform), specificity-second within each scope.
CREATE OR REPLACE FUNCTION public.resolve_delivery_zone(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_city text,
  p_postal_code text,
  p_province text,
  p_country text DEFAULT 'ZA'::text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_zone_id uuid;
  v_country text := COALESCE(p_country, 'ZA');
  v_scopes text[] := ARRAY['branch','tenant','platform'];
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY v_scopes LOOP
    -- Postcode prefix
    IF p_postal_code IS NOT NULL AND p_postal_code <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l
      JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = v_country
        AND l.match_type = 'postcode_prefix'
        AND p_postal_code LIKE (l.value || '%')
        AND z.is_active
        AND (
          (v_scope = 'branch'   AND z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
          OR (v_scope = 'tenant' AND z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
          OR (v_scope = 'platform' AND z.scope_type::text = 'platform')
        )
      ORDER BY length(l.value) DESC
      LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;

    -- City
    IF p_city IS NOT NULL AND p_city <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l
      JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = v_country
        AND l.match_type = 'city'
        AND lower(l.value) = lower(p_city)
        AND z.is_active
        AND (
          (v_scope = 'branch'   AND z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
          OR (v_scope = 'tenant' AND z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
          OR (v_scope = 'platform' AND z.scope_type::text = 'platform')
        )
      LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;

    -- Province
    IF p_province IS NOT NULL AND p_province <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l
      JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = v_country
        AND l.match_type = 'province'
        AND lower(l.value) = lower(p_province)
        AND z.is_active
        AND (
          (v_scope = 'branch'   AND z.scope_type::text = 'branch'   AND z.branch_id = p_branch_id)
          OR (v_scope = 'tenant' AND z.scope_type::text = 'tenant' AND z.tenant_id = p_tenant_id AND z.branch_id IS NULL)
          OR (v_scope = 'platform' AND z.scope_type::text = 'platform')
        )
      LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;

    -- Fallback within this scope
    SELECT id INTO v_zone_id FROM public.delivery_zones
    WHERE is_active AND is_default_fallback
      AND (
        (v_scope = 'branch'   AND scope_type::text = 'branch'   AND branch_id = p_branch_id)
        OR (v_scope = 'tenant' AND scope_type::text = 'tenant' AND tenant_id = p_tenant_id AND branch_id IS NULL)
        OR (v_scope = 'platform' AND scope_type::text = 'platform')
      )
    LIMIT 1;
    IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- 3. Quoter: inclusive tier upper bound + exclude tenant-disabled methods.
CREATE OR REPLACE FUNCTION public.quote_delivery_rate(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_zone_id uuid,
  p_method_id uuid,
  p_billable_kg numeric,
  p_currency text DEFAULT 'ZAR'::text
) RETURNS TABLE(
  rate_id uuid, method_id uuid, zone_id uuid, price numeric,
  currency_code text, min_weight_kg numeric, max_weight_kg numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT r.*, CASE
      WHEN r.scope_type = 'branch' AND r.branch_id = p_branch_id THEN 1
      WHEN r.scope_type = 'tenant' AND r.tenant_id = p_tenant_id AND r.branch_id IS NULL THEN 2
      WHEN r.scope_type = 'platform' THEN 3 ELSE 99 END AS scope_rank
    FROM public.delivery_rates r
    JOIN public.delivery_methods m ON m.id = r.method_id
    LEFT JOIN public.tenant_delivery_method_overrides o
      ON o.method_id = m.id AND o.tenant_id = p_tenant_id
    WHERE r.is_active AND r.zone_id = p_zone_id
      AND r.currency_code = COALESCE(p_currency,'ZAR')
      AND m.is_active
      AND COALESCE(o.is_enabled, true) = true
      AND (
        (p_method_id IS NOT NULL AND r.method_id = p_method_id)
        OR (p_method_id IS NULL AND m.fulfillment_kind = 'shipping')
      )
      AND p_billable_kg >= r.min_weight_kg
      AND (r.max_weight_kg IS NULL OR p_billable_kg <= r.max_weight_kg)
  )
  SELECT id, method_id, zone_id, price, currency_code, min_weight_kg, max_weight_kg
  FROM candidates ORDER BY scope_rank ASC, price ASC LIMIT 1;
$function$;