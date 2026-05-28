
-- ============================================================
-- DELIVERY PRICING ENGINE
-- ============================================================

CREATE TABLE public.delivery_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  is_express boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT ON public.delivery_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_methods TO authenticated;
GRANT ALL ON public.delivery_methods TO service_role;
ALTER TABLE public.delivery_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read delivery methods" ON public.delivery_methods FOR SELECT USING (true);
CREATE POLICY "Tenant admins manage delivery methods" ON public.delivery_methods FOR ALL TO authenticated
  USING (
    (tenant_id IS NULL AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  )
  WITH CHECK (
    (tenant_id IS NULL AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );
CREATE TRIGGER delivery_methods_updated_at BEFORE UPDATE ON public.delivery_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TYPE delivery_scope AS ENUM ('platform', 'tenant', 'branch');

CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type delivery_scope NOT NULL DEFAULT 'tenant',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  is_default_fallback boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, tenant_id, branch_id, code)
);
GRANT SELECT ON public.delivery_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read delivery zones" ON public.delivery_zones FOR SELECT USING (true);
CREATE POLICY "Tenant admins manage delivery zones" ON public.delivery_zones FOR ALL TO authenticated
  USING (
    (scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  )
  WITH CHECK (
    (scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );
CREATE TRIGGER delivery_zones_updated_at BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TYPE delivery_location_match AS ENUM ('city', 'postcode_prefix', 'province');

CREATE TABLE public.delivery_zone_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  match_type delivery_location_match NOT NULL,
  value text NOT NULL,
  country text NOT NULL DEFAULT 'ZA',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_zone_locations_zone_idx ON public.delivery_zone_locations (zone_id);
CREATE INDEX delivery_zone_locations_lookup_idx ON public.delivery_zone_locations (country, match_type, lower(value));
GRANT SELECT ON public.delivery_zone_locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zone_locations TO authenticated;
GRANT ALL ON public.delivery_zone_locations TO service_role;
ALTER TABLE public.delivery_zone_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read zone locations" ON public.delivery_zone_locations FOR SELECT USING (true);
CREATE POLICY "Tenant admins manage zone locations" ON public.delivery_zone_locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.delivery_zones z WHERE z.id = zone_id AND (
    (z.scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (z.tenant_id IS NOT NULL AND public.user_is_tenant_admin(z.tenant_id))
  )))
  WITH CHECK (EXISTS (SELECT 1 FROM public.delivery_zones z WHERE z.id = zone_id AND (
    (z.scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (z.tenant_id IS NOT NULL AND public.user_is_tenant_admin(z.tenant_id))
  )));


CREATE TABLE public.delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type delivery_scope NOT NULL DEFAULT 'tenant',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  method_id uuid NOT NULL REFERENCES public.delivery_methods(id) ON DELETE CASCADE,
  min_weight_kg numeric(8,3) NOT NULL DEFAULT 0,
  max_weight_kg numeric(8,3),
  price numeric(12,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'ZAR',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_rates_lookup_idx ON public.delivery_rates (scope_type, tenant_id, branch_id, zone_id, method_id, currency_code, is_active);
GRANT SELECT ON public.delivery_rates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_rates TO authenticated;
GRANT ALL ON public.delivery_rates TO service_role;
ALTER TABLE public.delivery_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read delivery rates" ON public.delivery_rates FOR SELECT USING (true);
CREATE POLICY "Tenant admins manage delivery rates" ON public.delivery_rates FOR ALL TO authenticated
  USING (
    (scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  )
  WITH CHECK (
    (scope_type = 'platform' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );
CREATE TRIGGER delivery_rates_updated_at BEFORE UPDATE ON public.delivery_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_delivery_zone(
  p_tenant_id uuid, p_branch_id uuid, p_city text, p_postal_code text, p_province text, p_country text DEFAULT 'ZA'
) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_zone_id uuid; v_scope text;
BEGIN
  FOR v_scope IN SELECT unnest(ARRAY['branch','tenant','platform']) LOOP
    IF p_postal_code IS NOT NULL AND p_postal_code <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = COALESCE(p_country,'ZA') AND l.match_type = 'postcode_prefix'
        AND p_postal_code LIKE (l.value || '%') AND z.is_active AND z.scope_type::text = v_scope
        AND (v_scope <> 'branch' OR z.branch_id = p_branch_id)
        AND (v_scope <> 'tenant' OR (z.tenant_id = p_tenant_id AND z.branch_id IS NULL))
      ORDER BY length(l.value) DESC LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;
    IF p_city IS NOT NULL AND p_city <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = COALESCE(p_country,'ZA') AND l.match_type = 'city'
        AND lower(l.value) = lower(p_city) AND z.is_active AND z.scope_type::text = v_scope
        AND (v_scope <> 'branch' OR z.branch_id = p_branch_id)
        AND (v_scope <> 'tenant' OR (z.tenant_id = p_tenant_id AND z.branch_id IS NULL))
      LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;
    IF p_province IS NOT NULL AND p_province <> '' THEN
      SELECT z.id INTO v_zone_id
      FROM public.delivery_zone_locations l JOIN public.delivery_zones z ON z.id = l.zone_id
      WHERE l.country = COALESCE(p_country,'ZA') AND l.match_type = 'province'
        AND lower(l.value) = lower(p_province) AND z.is_active AND z.scope_type::text = v_scope
        AND (v_scope <> 'branch' OR z.branch_id = p_branch_id)
        AND (v_scope <> 'tenant' OR (z.tenant_id = p_tenant_id AND z.branch_id IS NULL))
      LIMIT 1;
      IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
    END IF;
    SELECT id INTO v_zone_id FROM public.delivery_zones
    WHERE is_active AND is_default_fallback AND scope_type::text = v_scope
      AND (v_scope <> 'branch' OR branch_id = p_branch_id)
      AND (v_scope <> 'tenant' OR (tenant_id = p_tenant_id AND branch_id IS NULL))
    LIMIT 1;
    IF v_zone_id IS NOT NULL THEN RETURN v_zone_id; END IF;
  END LOOP;
  RETURN NULL;
END; $$;
GRANT EXECUTE ON FUNCTION public.resolve_delivery_zone(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.quote_delivery_rate(
  p_tenant_id uuid, p_branch_id uuid, p_zone_id uuid, p_method_id uuid,
  p_billable_kg numeric, p_currency text DEFAULT 'ZAR'
) RETURNS TABLE (
  rate_id uuid, method_id uuid, zone_id uuid, price numeric,
  currency_code text, min_weight_kg numeric, max_weight_kg numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH candidates AS (
    SELECT r.*, CASE
      WHEN r.scope_type = 'branch' AND r.branch_id = p_branch_id THEN 1
      WHEN r.scope_type = 'tenant' AND r.tenant_id = p_tenant_id AND r.branch_id IS NULL THEN 2
      WHEN r.scope_type = 'platform' THEN 3 ELSE 99 END AS scope_rank
    FROM public.delivery_rates r
    WHERE r.is_active AND r.zone_id = p_zone_id
      AND r.currency_code = COALESCE(p_currency,'ZAR')
      AND (p_method_id IS NULL OR r.method_id = p_method_id)
      AND p_billable_kg >= r.min_weight_kg
      AND (r.max_weight_kg IS NULL OR p_billable_kg < r.max_weight_kg)
  )
  SELECT id, method_id, zone_id, price, currency_code, min_weight_kg, max_weight_kg
  FROM candidates ORDER BY scope_rank ASC, price ASC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.quote_delivery_rate(uuid,uuid,uuid,uuid,numeric,text) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.clone_tenant_delivery_to_branch(p_branch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;
GRANT EXECUTE ON FUNCTION public.clone_tenant_delivery_to_branch(uuid) TO authenticated, service_role;


-- ============================================================
-- SEED: PostNet defaults
-- ============================================================

INSERT INTO public.delivery_methods (tenant_id, code, label, description, is_express, sort_order)
VALUES (NULL, 'postnet2door_non_express', 'PostNet2Door — Non-Express', 'Standard door-to-door delivery via PostNet', false, 10)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.delivery_zones (scope_type, tenant_id, branch_id, code, label, description, is_default_fallback, sort_order)
VALUES
  ('platform'::delivery_scope, NULL, NULL, 'major_centre', 'Major Centre', 'PostNet major metro areas', false, 10),
  ('platform'::delivery_scope, NULL, NULL, 'regional',     'Regional',     'Outside major metros — default fallback', true, 20)
ON CONFLICT (scope_type, tenant_id, branch_id, code) DO NOTHING;

WITH major AS (SELECT id FROM public.delivery_zones WHERE scope_type='platform' AND code='major_centre' LIMIT 1)
INSERT INTO public.delivery_zone_locations (zone_id, match_type, value, country)
SELECT major.id, 'city'::delivery_location_match, city, 'ZA' FROM major,
(VALUES ('Bloemfontein'),('Cape Town'),('Durban'),('East London'),('George'),('Johannesburg'),
        ('Sandton'),('Midrand'),('Randburg'),('Roodepoort'),('Kimberley'),('Nelspruit'),('Mbombela'),
        ('Polokwane'),('Port Elizabeth'),('Gqeberha'),('Pretoria'),('Centurion'),('Rustenburg')) AS t(city);

WITH m AS (SELECT id FROM public.delivery_methods WHERE tenant_id IS NULL AND code='postnet2door_non_express'),
     zmaj AS (SELECT id FROM public.delivery_zones WHERE scope_type='platform' AND code='major_centre'),
     zreg AS (SELECT id FROM public.delivery_zones WHERE scope_type='platform' AND code='regional')
INSERT INTO public.delivery_rates (scope_type, zone_id, method_id, min_weight_kg, max_weight_kg, price, currency_code, sort_order)
SELECT 'platform'::delivery_scope, zmaj.id, m.id, t.mn, t.mx, t.price, 'ZAR', t.so
FROM m, zmaj, (VALUES
  (0::numeric,  2::numeric,  185::numeric, 10),
  (2::numeric,  5::numeric,  220::numeric, 20),
  (5::numeric, 10::numeric,  280::numeric, 30),
  (10::numeric,20::numeric,  380::numeric, 40),
  (20::numeric, NULL::numeric, 520::numeric, 50)
) AS t(mn, mx, price, so)
UNION ALL
SELECT 'platform'::delivery_scope, zreg.id, m.id, t.mn, t.mx, t.price, 'ZAR', t.so
FROM m, zreg, (VALUES
  (0::numeric,  2::numeric,  275::numeric, 10),
  (2::numeric,  5::numeric,  320::numeric, 20),
  (5::numeric, 10::numeric,  380::numeric, 30),
  (10::numeric,20::numeric,  490::numeric, 40),
  (20::numeric, NULL::numeric, 640::numeric, 50)
) AS t(mn, mx, price, so);
