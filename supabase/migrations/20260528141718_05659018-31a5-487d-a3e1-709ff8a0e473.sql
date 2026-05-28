DO $$
DECLARE
  v_tenant uuid := 'c0000000-0000-0000-0000-000000000002';
  v_zone_major uuid := '8689b99f-5da8-48a8-a0cd-78badd26b5d4';     -- platform Major Centre
  v_zone_regional uuid := '35f07c7a-b84c-4fd6-893f-fa4cf96c9438';  -- platform Regional
  v_zone_outlying uuid;
  v_method_collect uuid;
  v_method_std uuid;
  v_method_exp uuid;
  v_old_zone uuid := '18e8a43d-3c61-4747-9c2c-5abe978f79e3';       -- empty PostNet Major Centre
BEGIN
  -- 1) Clean up the empty tenant zone (cascade removes its locations / any rates)
  DELETE FROM public.delivery_zone_locations WHERE zone_id = v_old_zone;
  DELETE FROM public.delivery_rates WHERE zone_id = v_old_zone;
  DELETE FROM public.delivery_zones WHERE id = v_old_zone;

  -- 2) Methods (tenant-scoped)
  INSERT INTO public.delivery_methods (tenant_id, code, label, description, is_express, sort_order, is_active)
  VALUES (v_tenant, 'collection', 'Collection from branch', 'Collect your order from your nearest PostNet branch — no delivery charge.', false, 10, true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_method_collect;
  IF v_method_collect IS NULL THEN
    SELECT id INTO v_method_collect FROM public.delivery_methods WHERE tenant_id = v_tenant AND code = 'collection';
  END IF;

  INSERT INTO public.delivery_methods (tenant_id, code, label, description, is_express, sort_order, is_active)
  VALUES (v_tenant, 'courier_standard', 'PostNet Courier — Standard', '2–3 business day courier delivery.', false, 20, true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_method_std;
  IF v_method_std IS NULL THEN
    SELECT id INTO v_method_std FROM public.delivery_methods WHERE tenant_id = v_tenant AND code = 'courier_standard';
  END IF;

  INSERT INTO public.delivery_methods (tenant_id, code, label, description, is_express, sort_order, is_active)
  VALUES (v_tenant, 'courier_express', 'PostNet Courier — Overnight', 'Next business day delivery to most major centres.', true, 30, true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_method_exp;
  IF v_method_exp IS NULL THEN
    SELECT id INTO v_method_exp FROM public.delivery_methods WHERE tenant_id = v_tenant AND code = 'courier_express';
  END IF;

  -- 3) Tenant fallback zone for unrecognised destinations
  INSERT INTO public.delivery_zones (scope_type, tenant_id, code, label, description, is_default_fallback, sort_order, is_active)
  VALUES ('tenant', v_tenant, 'outlying', 'Outlying & Remote', 'Fallback zone used when an address does not match a recognised SA postcode or major centre.', true, 90, true)
  RETURNING id INTO v_zone_outlying;

  -- 4) Rates. Helper macro via repeated inserts.
  -- Collection: free, all zones, no weight limit
  INSERT INTO public.delivery_rates (scope_type, tenant_id, zone_id, method_id, min_weight_kg, max_weight_kg, price, currency_code, is_active, sort_order)
  VALUES
    ('tenant', v_tenant, v_zone_major,    v_method_collect, 0, NULL, 0, 'ZAR', true, 1),
    ('tenant', v_tenant, v_zone_regional, v_method_collect, 0, NULL, 0, 'ZAR', true, 1),
    ('tenant', v_tenant, v_zone_outlying, v_method_collect, 0, NULL, 0, 'ZAR', true, 1);

  -- Courier Standard
  INSERT INTO public.delivery_rates (scope_type, tenant_id, zone_id, method_id, min_weight_kg, max_weight_kg, price, currency_code, is_active, sort_order) VALUES
    -- Major Centre
    ('tenant', v_tenant, v_zone_major, v_method_std, 0,  1,    95, 'ZAR', true, 10),
    ('tenant', v_tenant, v_zone_major, v_method_std, 1,  2,   115, 'ZAR', true, 11),
    ('tenant', v_tenant, v_zone_major, v_method_std, 2,  5,   150, 'ZAR', true, 12),
    ('tenant', v_tenant, v_zone_major, v_method_std, 5,  10,  210, 'ZAR', true, 13),
    ('tenant', v_tenant, v_zone_major, v_method_std, 10, 20,  320, 'ZAR', true, 14),
    ('tenant', v_tenant, v_zone_major, v_method_std, 20, 30,  450, 'ZAR', true, 15),
    -- Regional
    ('tenant', v_tenant, v_zone_regional, v_method_std, 0,  1,   130, 'ZAR', true, 10),
    ('tenant', v_tenant, v_zone_regional, v_method_std, 1,  2,   160, 'ZAR', true, 11),
    ('tenant', v_tenant, v_zone_regional, v_method_std, 2,  5,   210, 'ZAR', true, 12),
    ('tenant', v_tenant, v_zone_regional, v_method_std, 5,  10,  290, 'ZAR', true, 13),
    ('tenant', v_tenant, v_zone_regional, v_method_std, 10, 20,  430, 'ZAR', true, 14),
    ('tenant', v_tenant, v_zone_regional, v_method_std, 20, 30,  600, 'ZAR', true, 15),
    -- Outlying
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 0,  1,   180, 'ZAR', true, 10),
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 1,  2,   220, 'ZAR', true, 11),
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 2,  5,   290, 'ZAR', true, 12),
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 5,  10,  390, 'ZAR', true, 13),
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 10, 20,  580, 'ZAR', true, 14),
    ('tenant', v_tenant, v_zone_outlying, v_method_std, 20, 30,  800, 'ZAR', true, 15);

  -- Courier Express (~1.6× standard, rounded to nearest R5)
  INSERT INTO public.delivery_rates (scope_type, tenant_id, zone_id, method_id, min_weight_kg, max_weight_kg, price, currency_code, is_active, sort_order) VALUES
    -- Major Centre
    ('tenant', v_tenant, v_zone_major, v_method_exp, 0,  1,   150, 'ZAR', true, 20),
    ('tenant', v_tenant, v_zone_major, v_method_exp, 1,  2,   185, 'ZAR', true, 21),
    ('tenant', v_tenant, v_zone_major, v_method_exp, 2,  5,   240, 'ZAR', true, 22),
    ('tenant', v_tenant, v_zone_major, v_method_exp, 5,  10,  335, 'ZAR', true, 23),
    ('tenant', v_tenant, v_zone_major, v_method_exp, 10, 20,  510, 'ZAR', true, 24),
    ('tenant', v_tenant, v_zone_major, v_method_exp, 20, 30,  720, 'ZAR', true, 25),
    -- Regional
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 0,  1,   210, 'ZAR', true, 20),
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 1,  2,   255, 'ZAR', true, 21),
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 2,  5,   335, 'ZAR', true, 22),
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 5,  10,  465, 'ZAR', true, 23),
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 10, 20,  690, 'ZAR', true, 24),
    ('tenant', v_tenant, v_zone_regional, v_method_exp, 20, 30,  960, 'ZAR', true, 25),
    -- Outlying
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 0,  1,   290, 'ZAR', true, 20),
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 1,  2,   350, 'ZAR', true, 21),
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 2,  5,   465, 'ZAR', true, 22),
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 5,  10,  625, 'ZAR', true, 23),
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 10, 20,  930, 'ZAR', true, 24),
    ('tenant', v_tenant, v_zone_outlying, v_method_exp, 20, 30, 1280, 'ZAR', true, 25);
END $$;