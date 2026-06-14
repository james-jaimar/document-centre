CREATE OR REPLACE FUNCTION public.clone_master_catalog_to_tenant(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.user_is_tenant_admin(p_tenant_id) OR public.has_role(auth.uid(),'platform_admin'::app_role)) THEN
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

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, m.paper_id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_paper_prices m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.paper_id=m.paper_id AND t.size_code=m.size_code);

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, m.finishing_id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_finishing_prices m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices t
      WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
        AND t.finishing_id=m.finishing_id
        AND COALESCE(t.size_code,'__any__')=COALESCE(m.size_code,'__any__'));

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'tenant', p_tenant_id, m.product_family_id, m.catalog, m.sub_attribute, m.item_code, m.sort_order, m.is_default
  FROM public.product_catalog_links m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
      AND t.product_family_id=m.product_family_id AND t.catalog=m.catalog
      AND COALESCE(t.sub_attribute,'') = COALESCE(m.sub_attribute,'') AND t.item_code=m.item_code);
END $function$;

CREATE OR REPLACE FUNCTION public.resync_tenant_catalog_from_master(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.user_is_tenant_admin(p_tenant_id) OR public.has_role(auth.uid(),'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM public.product_catalog_links     WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_finishing_prices  WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_paper_prices      WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_finishing         WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_papers            WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_print_attrs       WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;
  DELETE FROM public.catalog_sizes             WHERE scope_type='tenant' AND tenant_id=p_tenant_id AND branch_id IS NULL;

  PERFORM public.clone_master_catalog_to_tenant(p_tenant_id);
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

  -- Sizes: prefer tenant, fall back to master
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

  INSERT INTO public.catalog_papers (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.weight_gsm, s.finish, s.category, s.sort_order, s.is_active, s.metadata
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

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, branch_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, s.paper_id, s.size_code, s.sell_price_minor, s.cost_price_minor, s.is_active
  FROM (
    SELECT DISTINCT ON (paper_id, size_code) * FROM public.catalog_paper_prices
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY paper_id, size_code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.paper_id=s.paper_id AND b.size_code=s.size_code);

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, branch_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, s.finishing_id, s.size_code, s.sell_price_minor, s.cost_price_minor, s.is_active
  FROM (
    SELECT DISTINCT ON (finishing_id, COALESCE(size_code,'__any__')) * FROM public.catalog_finishing_prices
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY finishing_id, COALESCE(size_code,'__any__'), CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.finishing_id=s.finishing_id
      AND COALESCE(b.size_code,'__any__')=COALESCE(s.size_code,'__any__'));

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

CREATE OR REPLACE FUNCTION public.resync_branch_catalog_from_tenant(p_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_can_manage_branch_catalog(p_branch_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM public.product_catalog_links     WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_finishing_prices  WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_paper_prices      WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_finishing         WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_papers            WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_print_attrs       WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_sizes             WHERE scope_type='branch' AND branch_id=p_branch_id;

  PERFORM public.clone_tenant_catalog_to_branch(p_branch_id);
END $function$;