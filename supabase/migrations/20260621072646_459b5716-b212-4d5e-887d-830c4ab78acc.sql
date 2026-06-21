
-- Fix catalog cascade clones to include all paper columns and remap IDs at branch scope.

CREATE OR REPLACE FUNCTION public.clone_master_catalog_to_tenant(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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

  INSERT INTO public.catalog_papers (scope_type, tenant_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata, stocked_sizes, is_cover_stock, is_edge_to_edge_only)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.category, m.sort_order, m.is_active, m.metadata, m.stocked_sizes, m.is_cover_stock, m.is_edge_to_edge_only
  FROM public.catalog_papers m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_papers t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.variant, m.pricing_basis, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_finishing m
  WHERE m.scope_type='master'
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

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'tenant', p_tenant_id, m.product_family_id, m.catalog, m.sub_attribute, m.item_code, m.sort_order, m.is_default
  FROM public.product_catalog_links m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
      AND t.product_family_id=m.product_family_id AND t.catalog=m.catalog
      AND COALESCE(t.sub_attribute,'') = COALESCE(m.sub_attribute,'') AND t.item_code=m.item_code);
END $function$;


CREATE OR REPLACE FUNCTION public.clone_tenant_catalog_to_branch(p_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.user_can_manage_branch_catalog(p_branch_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, branch_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.width_mm, s.height_mm, s.iso_name, s.region, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_sizes
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_sizes b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, branch_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.attribute, s.code, s.label, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (attribute, code) * FROM public.catalog_print_attrs
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY attribute, code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.attribute=s.attribute AND b.code=s.code);

  -- Papers: now includes stocked_sizes / is_cover_stock / is_edge_to_edge_only so the
  -- branch table renders editable per-size price cells instead of "No sizes set".
  INSERT INTO public.catalog_papers (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata, stocked_sizes, is_cover_stock, is_edge_to_edge_only)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.weight_gsm, s.finish, s.category, s.sort_order, s.is_active, s.metadata, s.stocked_sizes, s.is_cover_stock, s.is_edge_to_edge_only
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_papers
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_papers b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, branch_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.category, s.variant, s.pricing_basis, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_finishing
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_finishing b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  -- Paper prices: remap parent's paper_id -> branch's paper_id via code join.
  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, branch_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bp.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sp.code, cp.size_code)
      sp.code AS paper_code, cp.size_code, cp.sell_price_minor, cp.cost_price_minor, cp.is_active,
      cp.scope_type
    FROM public.catalog_paper_prices cp
    JOIN public.catalog_papers sp ON sp.id = cp.paper_id
    WHERE (cp.scope_type='tenant' AND cp.tenant_id=v_tenant AND cp.branch_id IS NULL)
       OR cp.scope_type='master'
    ORDER BY sp.code, cp.size_code, CASE cp.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_papers bp
    ON bp.code = src.paper_code AND bp.scope_type='branch' AND bp.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_paper_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.paper_id=bp.id AND b.size_code=src.size_code
  );

  -- Finishing prices: remap parent's finishing_id -> branch's finishing_id via code join.
  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, branch_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bf.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sf.code, COALESCE(cf.size_code,'__any__'))
      sf.code AS finishing_code, cf.size_code, cf.sell_price_minor, cf.cost_price_minor, cf.is_active,
      cf.scope_type
    FROM public.catalog_finishing_prices cf
    JOIN public.catalog_finishing sf ON sf.id = cf.finishing_id
    WHERE (cf.scope_type='tenant' AND cf.tenant_id=v_tenant AND cf.branch_id IS NULL)
       OR cf.scope_type='master'
    ORDER BY sf.code, COALESCE(cf.size_code,'__any__'), CASE cf.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_finishing bf
    ON bf.code = src.finishing_code AND bf.scope_type='branch' AND bf.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_finishing_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.finishing_id=bf.id
      AND COALESCE(b.size_code,'__any__')=COALESCE(src.size_code,'__any__')
  );

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'branch', v_tenant, p_branch_id, s.product_family_id, s.catalog, s.sub_attribute, s.item_code, s.sort_order, s.is_default
  FROM (
    SELECT DISTINCT ON (product_family_id, catalog, COALESCE(sub_attribute,''), item_code) *
    FROM public.product_catalog_links
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY product_family_id, catalog, COALESCE(sub_attribute,''), item_code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.product_catalog_links b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.product_family_id=s.product_family_id AND b.catalog=s.catalog
      AND COALESCE(b.sub_attribute,'') = COALESCE(s.sub_attribute,'') AND b.item_code=s.item_code);
END $function$;
