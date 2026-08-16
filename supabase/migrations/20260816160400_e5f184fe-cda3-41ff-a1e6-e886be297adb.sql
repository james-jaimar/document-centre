CREATE OR REPLACE FUNCTION public.catalog_unit_twin_code(p_catalog text, p_code text, p_unit text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_code text;
BEGIN
  IF p_catalog = 'size' THEN
    SELECT code INTO v_code FROM public.catalog_sizes
      WHERE scope_type='master' AND unit_system=p_unit AND metadata->>'unit_twin' = p_code LIMIT 1;
  ELSIF p_catalog = 'paper' THEN
    SELECT code INTO v_code FROM public.catalog_papers
      WHERE scope_type='master' AND unit_system=p_unit AND metadata->>'unit_twin' = p_code LIMIT 1;
  ELSIF p_catalog = 'finishing' THEN
    SELECT code INTO v_code FROM public.catalog_finishing
      WHERE scope_type='master' AND unit_system=p_unit AND metadata->>'unit_twin' = p_code LIMIT 1;
  END IF;
  RETURN v_code;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.catalog_unit_twin_code(text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clone_tenant_catalog_to_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid;
  v_unit text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  v_unit := public.resolve_catalog_unit_system(v_tenant, p_branch_id);

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, branch_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata, unit_system)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.width_mm, s.height_mm, s.iso_name, s.region, s.sort_order, s.is_active, s.metadata, s.unit_system
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_sizes
    WHERE unit_system = v_unit
      AND ((scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master')
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

  INSERT INTO public.catalog_papers (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata, stocked_sizes, is_cover_stock, is_edge_to_edge_only, weight_lb, lb_basis, unit_system)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.weight_gsm, s.finish, s.category, s.sort_order, s.is_active, s.metadata, s.stocked_sizes, s.is_cover_stock, s.is_edge_to_edge_only, s.weight_lb, s.lb_basis, s.unit_system
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_papers
    WHERE unit_system = v_unit
      AND ((scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master')
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_papers b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, branch_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata, binding_method, color, size_mm, size_in, max_sheets, unit_system)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.category, s.variant, s.pricing_basis, s.sort_order, s.is_active, s.metadata, s.binding_method, s.color, s.size_mm, s.size_in, s.max_sheets, s.unit_system
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_finishing
    WHERE unit_system = v_unit
      AND ((scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master')
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_finishing b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, branch_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bp.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sp.code, cp.size_code)
      sp.code AS paper_code, cp.size_code, cp.sell_price_minor, cp.cost_price_minor, cp.is_active, cp.scope_type
    FROM public.catalog_paper_prices cp
    JOIN public.catalog_papers sp ON sp.id = cp.paper_id
    WHERE (cp.scope_type='tenant' AND cp.tenant_id=v_tenant AND cp.branch_id IS NULL) OR cp.scope_type='master'
    ORDER BY sp.code, cp.size_code, CASE cp.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_papers bp ON bp.code = src.paper_code AND bp.scope_type='branch' AND bp.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_paper_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.paper_id=bp.id AND b.size_code=src.size_code);

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, branch_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bf.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sf.code, COALESCE(cf.size_code,'__any__'))
      sf.code AS finishing_code, cf.size_code, cf.sell_price_minor, cf.cost_price_minor, cf.is_active, cf.scope_type
    FROM public.catalog_finishing_prices cf
    JOIN public.catalog_finishing sf ON sf.id = cf.finishing_id
    WHERE (cf.scope_type='tenant' AND cf.tenant_id=v_tenant AND cf.branch_id IS NULL) OR cf.scope_type='master'
    ORDER BY sf.code, COALESCE(cf.size_code,'__any__'), CASE cf.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_finishing bf ON bf.code = src.finishing_code AND bf.scope_type='branch' AND bf.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_finishing_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.finishing_id=bf.id
      AND COALESCE(b.size_code,'__any__')=COALESCE(src.size_code,'__any__'));

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'branch', v_tenant, p_branch_id, s.product_family_id, s.catalog, s.sub_attribute, s.item_code, s.sort_order, s.is_default
  FROM (
    SELECT DISTINCT ON (product_family_id, catalog, COALESCE(sub_attribute,''), item_code) *
    FROM public.product_catalog_links
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY product_family_id, catalog, COALESCE(sub_attribute,''), item_code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_sizes cs WHERE s.catalog='size' AND cs.scope_type='branch' AND cs.branch_id=p_branch_id AND cs.code=s.item_code
    UNION ALL SELECT 1 FROM public.catalog_papers cp WHERE s.catalog='paper' AND cp.scope_type='branch' AND cp.branch_id=p_branch_id AND cp.code=s.item_code
    UNION ALL SELECT 1 FROM public.catalog_finishing cf WHERE s.catalog='finishing' AND cf.scope_type='branch' AND cf.branch_id=p_branch_id AND cf.code=s.item_code
    UNION ALL SELECT 1 WHERE s.catalog='print_attr'
  )
  AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.product_family_id=s.product_family_id AND b.catalog=s.catalog
      AND COALESCE(b.sub_attribute,'') = COALESCE(s.sub_attribute,'') AND b.item_code=s.item_code);
END;
$fn$;