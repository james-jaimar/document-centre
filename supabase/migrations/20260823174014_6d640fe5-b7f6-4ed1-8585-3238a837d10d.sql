ALTER TABLE public.product_catalog_links
  ADD COLUMN IF NOT EXISTS unit_system text NULL
  CHECK (unit_system IS NULL OR unit_system IN ('metric','imperial'));

-- Existing size links were all authored against the metric master list.
UPDATE public.product_catalog_links
   SET unit_system = 'metric'
 WHERE catalog = 'size' AND unit_system IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_product_options(p_product_family_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(catalog catalog_kind, sub_attribute text, item_code text, label text, sort_order integer, is_default boolean, is_enabled boolean, metadata jsonb, price_delta_minor integer, price_override_minor integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH effective_tenant AS (
    SELECT COALESCE(
      p_tenant_id,
      (SELECT tenant_id FROM public.branches WHERE id = p_branch_id)
    ) AS tid
  ),
  unit AS (
    SELECT public.resolve_catalog_unit_system((SELECT tid FROM effective_tenant), p_branch_id) AS u
  ),
  links AS (
    SELECT pcl.*
    FROM public.product_catalog_links pcl
    CROSS JOIN unit u
    WHERE pcl.product_family_id = p_product_family_id
      AND pcl.scope_type = 'master'
      AND (pcl.unit_system IS NULL OR pcl.unit_system = u.u)
  ),
  mapped AS (
    SELECT
      l.catalog,
      l.sub_attribute,
      l.sort_order,
      l.is_default,
      CASE
        WHEN l.catalog = 'print_attr' THEN l.item_code
        WHEN public.catalog_code_in_unit(l.catalog::text, l.item_code, l.sub_attribute, u.u) THEN l.item_code
        ELSE public.catalog_unit_twin_code(l.catalog::text, l.item_code, u.u)
      END AS item_code
    FROM links l CROSS JOIN unit u
  ),
  filtered AS (
    SELECT * FROM mapped WHERE item_code IS NOT NULL
  ),
  resolved AS (
    SELECT
      l.catalog, l.sub_attribute, l.item_code,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.label FROM public.catalog_sizes cs WHERE cs.code = l.item_code AND cs.scope_type='master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.label FROM public.catalog_print_attrs cpa WHERE cpa.attribute=l.sub_attribute AND cpa.code=l.item_code AND cpa.scope_type='master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT cp.label FROM public.catalog_papers cp WHERE cp.code=l.item_code AND cp.scope_type='master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT cf.label FROM public.catalog_finishing cf WHERE cf.code=l.item_code AND cf.scope_type='master' LIMIT 1)
      END AS label,
      l.sort_order, l.is_default,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.is_active FROM public.catalog_sizes cs WHERE cs.code=l.item_code AND cs.scope_type='master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.is_active FROM public.catalog_print_attrs cpa WHERE cpa.attribute=l.sub_attribute AND cpa.code=l.item_code AND cpa.scope_type='master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT cp.is_active FROM public.catalog_papers cp WHERE cp.code=l.item_code AND cp.scope_type='master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT cf.is_active FROM public.catalog_finishing cf WHERE cf.code=l.item_code AND cf.scope_type='master' LIMIT 1)
      END AS master_active,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT jsonb_build_object('width_mm',cs.width_mm,'height_mm',cs.height_mm,'iso',cs.iso_name,'region',cs.region,'unit_system',cs.unit_system) || COALESCE(cs.metadata,'{}'::jsonb) FROM public.catalog_sizes cs WHERE cs.code=l.item_code AND cs.scope_type='master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.metadata FROM public.catalog_print_attrs cpa WHERE cpa.attribute=l.sub_attribute AND cpa.code=l.item_code AND cpa.scope_type='master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT jsonb_build_object('weight_gsm',cp.weight_gsm,'finish',cp.finish,'category',cp.category,'unit_system',cp.unit_system) || COALESCE(cp.metadata,'{}'::jsonb) FROM public.catalog_papers cp WHERE cp.code=l.item_code AND cp.scope_type='master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT jsonb_build_object('category',cf.category,'variant',cf.variant,'pricing_basis',cf.pricing_basis,'unit_system',cf.unit_system) || COALESCE(cf.metadata,'{}'::jsonb) FROM public.catalog_finishing cf WHERE cf.code=l.item_code AND cf.scope_type='master' LIMIT 1)
      END AS master_metadata
    FROM filtered l
  )
  SELECT
    r.catalog, r.sub_attribute, r.item_code,
    COALESCE(bco.label_override, tco.label_override, r.label) AS label,
    r.sort_order, r.is_default,
    COALESCE(r.master_active, true)
      AND COALESCE(tco.is_enabled, true)
      AND COALESCE(bco.is_enabled, true) AS is_enabled,
    COALESCE(bco.metadata_override, tco.metadata_override, r.master_metadata, '{}'::jsonb) AS metadata,
    COALESCE(bco.price_delta_minor, tco.price_delta_minor) AS price_delta_minor,
    COALESCE(bco.price_override_minor, tco.price_override_minor) AS price_override_minor
  FROM resolved r
  CROSS JOIN effective_tenant et
  LEFT JOIN public.tenant_catalog_overrides tco
    ON et.tid IS NOT NULL
   AND tco.tenant_id = et.tid
   AND tco.catalog = r.catalog
   AND COALESCE(tco.sub_attribute,'') = COALESCE(r.sub_attribute,'')
   AND tco.item_code = r.item_code
  LEFT JOIN public.branch_catalog_overrides bco
    ON p_branch_id IS NOT NULL
   AND bco.branch_id = p_branch_id
   AND bco.catalog = r.catalog
   AND COALESCE(bco.sub_attribute,'') = COALESCE(r.sub_attribute,'')
   AND bco.item_code = r.item_code
  ORDER BY r.catalog, r.sub_attribute NULLS FIRST, r.sort_order, r.item_code;
$function$;