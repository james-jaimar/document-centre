
-- Hard-sync function: tenant rate card becomes an exact copy of master.
CREATE OR REPLACE FUNCTION public.sync_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ===== CLICKS (key: size, colour, sides) =====
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, sell_price, cost_price, is_active)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.sell_price, m.cost_price, m.is_active
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_clicks t
  SET sell_price = m.sell_price,
      cost_price = m.cost_price,
      is_active  = m.is_active
  FROM public.rate_card_clicks m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master'
    AND t.size = m.size AND t.colour = m.colour AND t.sides = m.sides;

  DELETE FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks m
      WHERE m.scope_type = 'master'
        AND m.size = t.size AND m.colour = t.colour AND m.sides = t.sides
    );

  -- ===== PAPERS (key: code) =====
  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, code, label, weight_gsm, finish, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_papers m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_papers t
  SET label = m.label, weight_gsm = m.weight_gsm, finish = m.finish, size = m.size,
      sell_price = m.sell_price, cost_price = m.cost_price,
      sort_order = m.sort_order, is_active = m.is_active
  FROM public.rate_card_papers m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master' AND t.code = m.code;

  DELETE FROM public.rate_card_papers t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_papers m
      WHERE m.scope_type = 'master' AND m.code = t.code
    );

  -- ===== FINISHING (key: code) =====
  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, code, label, category, pricing_basis, variant, size,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.pricing_basis, m.variant, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_finishing m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_finishing t
  SET label = m.label, category = m.category, pricing_basis = m.pricing_basis,
      variant = m.variant, size = m.size,
      sell_price = m.sell_price, cost_price = m.cost_price,
      sort_order = m.sort_order, is_active = m.is_active
  FROM public.rate_card_finishing m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master' AND t.code = m.code;

  DELETE FROM public.rate_card_finishing t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_finishing m
      WHERE m.scope_type = 'master' AND m.code = t.code
    );

  -- ===== PHOTO PRINTS (key: code) =====
  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, code, label, size_slug, width_mm, height_mm, finish, border_mm,
     sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.size_slug, m.width_mm, m.height_mm, m.finish, m.border_mm,
         m.sell_price, m.cost_price, m.min_quantity, m.sort_order, m.is_active
  FROM public.rate_card_photo_prints m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_photo_prints t
  SET label = m.label, size_slug = m.size_slug, width_mm = m.width_mm, height_mm = m.height_mm,
      finish = m.finish, border_mm = m.border_mm,
      sell_price = m.sell_price, cost_price = m.cost_price,
      min_quantity = m.min_quantity, sort_order = m.sort_order, is_active = m.is_active
  FROM public.rate_card_photo_prints m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master' AND t.code = m.code;

  DELETE FROM public.rate_card_photo_prints t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints m
      WHERE m.scope_type = 'master' AND m.code = t.code
    );

  -- ===== BUSINESS CARDS (key: code) =====
  INSERT INTO public.rate_card_business_cards
    (scope_type, tenant_id, code, label, quantity, sides, paper, finish,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.quantity, m.sides, m.paper, m.finish,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_business_cards m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_business_cards t
  SET label = m.label, quantity = m.quantity, sides = m.sides, paper = m.paper, finish = m.finish,
      sell_price = m.sell_price, cost_price = m.cost_price,
      sort_order = m.sort_order, is_active = m.is_active
  FROM public.rate_card_business_cards m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master' AND t.code = m.code;

  DELETE FROM public.rate_card_business_cards t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_business_cards m
      WHERE m.scope_type = 'master' AND m.code = t.code
    );

  -- ===== PRICING RULES: drop all tenant + branch overrides → fall back to master =====
  DELETE FROM public.pricing_rules
  WHERE tenant_id = p_tenant_id;

  -- ===== PRODUCT PRICE OVERRIDES: tenant-only concept, wipe to reset =====
  DELETE FROM public.product_price_overrides
  WHERE tenant_id = p_tenant_id;
END;
$$;

-- One-off execution for every active tenant.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE is_active = true LOOP
    PERFORM public.sync_master_rate_card_to_tenant(t.id);
  END LOOP;
END $$;
