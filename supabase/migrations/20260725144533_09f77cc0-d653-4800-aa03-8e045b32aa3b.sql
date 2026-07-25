DROP INDEX IF EXISTS public.rcc_master_unique;
DROP INDEX IF EXISTS public.rcc_tenant_unique;
DROP INDEX IF EXISTS public.rcc_branch_unique;

CREATE UNIQUE INDEX rcc_master_unique
ON public.rate_card_clicks (
  COALESCE(NULLIF(lower(catalog_size_code), ''), lower(size)),
  colour,
  sides,
  COALESCE(NULLIF(lower(variant_code), ''), '')
)
WHERE scope_type = 'master'::rate_card_scope;

CREATE UNIQUE INDEX rcc_tenant_unique
ON public.rate_card_clicks (
  tenant_id,
  COALESCE(NULLIF(lower(catalog_size_code), ''), lower(size)),
  colour,
  sides,
  COALESCE(NULLIF(lower(variant_code), ''), '')
)
WHERE scope_type = 'tenant'::rate_card_scope;

CREATE UNIQUE INDEX rcc_branch_unique
ON public.rate_card_clicks (
  branch_id,
  COALESCE(NULLIF(lower(catalog_size_code), ''), lower(size)),
  colour,
  sides,
  COALESCE(NULLIF(lower(variant_code), ''), '')
)
WHERE scope_type = 'branch'::rate_card_scope;

CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, variant_code, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.variant_code, m.sell_price, m.cost_price, m.is_active, m.catalog_size_code
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size)) = COALESCE(NULLIF(lower(m.catalog_size_code), ''), lower(m.size))
        AND t.colour = m.colour AND t.sides = m.sides
        AND COALESCE(NULLIF(lower(t.variant_code), ''), '') = COALESCE(NULLIF(lower(m.variant_code), ''), '')
    );

  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, code, label, size_slug, width_mm, height_mm, finish, border_mm,
     sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.size_slug, m.width_mm, m.height_mm, m.finish, m.border_mm,
         m.sell_price, m.cost_price, m.min_quantity, m.sort_order, m.is_active
  FROM public.rate_card_photo_prints m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  INSERT INTO public.rate_card_business_cards
    (scope_type, tenant_id, code, label, quantity, sides, paper, finish,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.quantity, m.sides, m.paper, m.finish,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_business_cards m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_business_cards t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.clone_tenant_pricing_to_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % has no tenant', p_branch_id;
  END IF;

  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, branch_id, size, colour, sides, variant_code, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.size, t.colour, t.sides, t.variant_code, t.sell_price, t.cost_price, t.is_active, t.catalog_size_code
  FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND COALESCE(NULLIF(lower(b.catalog_size_code), ''), lower(b.size)) = COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size))
        AND b.colour = t.colour AND b.sides = t.sides
        AND COALESCE(NULLIF(lower(b.variant_code), ''), '') = COALESCE(NULLIF(lower(t.variant_code), ''), '')
    );

  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, branch_id, code, label, size_slug, width_mm, height_mm, finish, border_mm, sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.code, t.label, t.size_slug, t.width_mm, t.height_mm, t.finish, t.border_mm, t.sell_price, t.cost_price, t.min_quantity, t.sort_order, t.is_active
  FROM public.rate_card_photo_prints t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id AND b.code = t.code
    );

  INSERT INTO public.rate_card_business_cards
    (scope_type, tenant_id, branch_id, code, label, quantity, sides, paper, finish, sell_price, cost_price, sort_order, is_active)
  SELECT 'branch', v_tenant, p_branch_id, t.code, t.label, t.quantity, t.sides, t.paper, t.finish, t.sell_price, t.cost_price, t.sort_order, t.is_active
  FROM public.rate_card_business_cards t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_business_cards b
      WHERE b.scope_type = 'branch' AND b.branch_id = p_branch_id AND b.code = t.code
    );

  INSERT INTO public.pricing_rules
    (tenant_id, branch_id, product_family_id, name, rule_type, conditions,
     price_value, is_active, sort_order, currency_code)
  SELECT r.tenant_id, p_branch_id, r.product_family_id, r.name, r.rule_type, r.conditions,
         r.price_value, r.is_active, r.sort_order, r.currency_code
  FROM public.pricing_rules r
  WHERE r.tenant_id = v_tenant AND r.branch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pricing_rules b
      WHERE b.branch_id = p_branch_id
        AND b.product_family_id IS NOT DISTINCT FROM r.product_family_id
        AND b.name = r.name
        AND b.rule_type = r.rule_type
        AND b.currency_code = r.currency_code
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- ===== CLICKS (key: canonical size, colour, sides, variant_code) =====
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, variant_code, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.variant_code, m.sell_price, m.cost_price, m.is_active, m.catalog_size_code
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
  ON CONFLICT DO NOTHING;

  UPDATE public.rate_card_clicks t
  SET sell_price = m.sell_price,
      cost_price = m.cost_price,
      is_active  = m.is_active,
      catalog_size_code = m.catalog_size_code
  FROM public.rate_card_clicks m
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND m.scope_type = 'master'
    AND COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size)) = COALESCE(NULLIF(lower(m.catalog_size_code), ''), lower(m.size))
    AND t.colour = m.colour AND t.sides = m.sides
    AND COALESCE(NULLIF(lower(t.variant_code), ''), '') = COALESCE(NULLIF(lower(m.variant_code), ''), '');

  DELETE FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks m
      WHERE m.scope_type = 'master'
        AND COALESCE(NULLIF(lower(m.catalog_size_code), ''), lower(m.size)) = COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size))
        AND m.colour = t.colour AND m.sides = t.sides
        AND COALESCE(NULLIF(lower(m.variant_code), ''), '') = COALESCE(NULLIF(lower(t.variant_code), ''), '')
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
END;
$function$;