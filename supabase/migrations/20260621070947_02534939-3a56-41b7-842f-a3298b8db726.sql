
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
    (scope_type, tenant_id, branch_id, size, colour, sides, sell_price, cost_price, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.size, t.colour, t.sides, t.sell_price, t.cost_price, t.is_active
  FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND b.size = t.size AND b.colour = t.colour AND b.sides = t.sides
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
  SELECT v_tenant, p_branch_id, t.product_family_id, t.name, t.rule_type, t.conditions,
         t.price_value, t.is_active, t.sort_order, t.currency_code
  FROM public.pricing_rules t
  WHERE t.tenant_id = v_tenant AND t.branch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pricing_rules b
      WHERE b.tenant_id = v_tenant AND b.branch_id = p_branch_id
        AND b.name = t.name
        AND COALESCE(b.product_family_id::text,'') = COALESCE(t.product_family_id::text,'')
        AND b.currency_code = t.currency_code
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resync_branch_pricing_from_tenant(p_branch_id uuid)
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

  IF NOT (
    public.user_is_tenant_admin(v_tenant)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = p_branch_id
        AND tm.role IN ('branch_manager','store_operator','owner','admin')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to resync branch %', p_branch_id;
  END IF;

  DELETE FROM public.rate_card_clicks         WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_photo_prints   WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_business_cards WHERE scope_type = 'branch' AND branch_id = p_branch_id;
  DELETE FROM public.pricing_rules            WHERE branch_id = p_branch_id;

  PERFORM public.clone_tenant_pricing_to_branch(p_branch_id);
END;
$function$;
