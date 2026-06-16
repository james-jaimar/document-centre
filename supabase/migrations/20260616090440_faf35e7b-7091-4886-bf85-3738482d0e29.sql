
CREATE OR REPLACE FUNCTION public.clone_master_catalog_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow: tenant admin, platform admin, trigger context, or system call (no auth).
  IF NOT (
    pg_trigger_depth() > 0
    OR auth.uid() IS NULL
    OR public.user_is_tenant_admin(p_tenant_id)
    OR public.has_role(auth.uid(),'platform_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.width_mm, m.height_mm, m.iso_name, m.region, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_sizes m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_sizes t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.attribute, m.code, m.label, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_print_attrs m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.attribute=m.attribute AND t.code=m.code);

  INSERT INTO public.catalog_papers (scope_type, tenant_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.category, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_papers m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_papers t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.variant, m.pricing_basis, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_finishing m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  -- Note: prices reference paper/finishing IDs which differ per scope. We
  -- copy by matching codes between master and tenant copies just inserted.
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

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'tenant', p_tenant_id, m.product_family_id, m.catalog, m.sub_attribute, m.item_code, m.sort_order, m.is_default
  FROM public.product_catalog_links m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
      AND t.product_family_id=m.product_family_id AND t.catalog=m.catalog
      AND COALESCE(t.sub_attribute,'') = COALESCE(m.sub_attribute,'') AND t.item_code=m.item_code);
END $function$;
