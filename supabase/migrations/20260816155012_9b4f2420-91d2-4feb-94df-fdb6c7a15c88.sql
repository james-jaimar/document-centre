CREATE OR REPLACE FUNCTION public.clone_master_catalog_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_unit text;
BEGIN
  IF NOT (
    pg_trigger_depth() > 0
    OR auth.uid() IS NULL
    OR public.user_is_tenant_admin(p_tenant_id)
    OR public.has_role(auth.uid(),'platform_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  v_unit := public.resolve_catalog_unit_system(p_tenant_id, NULL);

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata, unit_system)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.width_mm, m.height_mm, m.iso_name, m.region, m.sort_order, m.is_active, m.metadata, m.unit_system
  FROM public.catalog_sizes m
  WHERE m.scope_type='master' AND m.unit_system = v_unit
    AND NOT EXISTS (SELECT 1 FROM public.catalog_sizes t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.attribute, m.code, m.label, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_print_attrs m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.attribute=m.attribute AND t.code=m.code);

  INSERT INTO public.catalog_papers (scope_type, tenant_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata, stocked_sizes, is_cover_stock, is_edge_to_edge_only, weight_lb, lb_basis, unit_system)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.category, m.sort_order, m.is_active, m.metadata, m.stocked_sizes, m.is_cover_stock, m.is_edge_to_edge_only, m.weight_lb, m.lb_basis, m.unit_system
  FROM public.catalog_papers m
  WHERE m.scope_type='master' AND m.unit_system = v_unit
    AND NOT EXISTS (SELECT 1 FROM public.catalog_papers t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata, binding_method, color, size_mm, size_in, max_sheets, unit_system)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.variant, m.pricing_basis, m.sort_order, m.is_active, m.metadata, m.binding_method, m.color, m.size_mm, m.size_in, m.max_sheets, m.unit_system
  FROM public.catalog_finishing m
  WHERE m.scope_type='master' AND m.unit_system = v_unit
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, tp.id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_paper_prices m
  JOIN public.catalog_papers mp ON mp.id = m.paper_id AND mp.scope_type='master'
  JOIN public.catalog_papers tp ON tp.code = mp.code AND tp.scope_type='tenant' AND tp.tenant_id = p_tenant_id
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.paper_id=tp.id AND t.size_code=m.size_code);

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, tf.id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_finishing_prices m
  JOIN public.catalog_finishing mf ON mf.id = m.finishing_id AND mf.scope_type='master'
  JOIN public.catalog_finishing tf ON tf.code = mf.code AND tf.scope_type='tenant' AND tf.tenant_id = p_tenant_id
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices t
      WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
        AND t.finishing_id=tf.id
        AND COALESCE(t.size_code,'__any__')=COALESCE(m.size_code,'__any__'));

  -- Product links: translate master (metric) item codes to the tenant's unit twin.
  INSERT INTO public.product_catalog_links (scope_type, tenant_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'tenant', p_tenant_id, s.product_family_id, s.catalog, s.sub_attribute, s.item_code, s.sort_order, s.is_default
  FROM (
    SELECT m.product_family_id, m.catalog, m.sub_attribute, m.sort_order, m.is_default,
      CASE
        WHEN v_unit = 'metric' OR m.catalog = 'print_attr' THEN m.item_code
        ELSE COALESCE(public.catalog_unit_twin_code(m.catalog::text, m.item_code, v_unit), m.item_code)
      END AS item_code
    FROM public.product_catalog_links m
    WHERE m.scope_type='master'
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.product_catalog_links t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
      AND t.product_family_id=s.product_family_id AND t.catalog=s.catalog
      AND COALESCE(t.sub_attribute,'') = COALESCE(s.sub_attribute,'') AND t.item_code=s.item_code);
END;
$fn$;