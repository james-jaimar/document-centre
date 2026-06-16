CREATE OR REPLACE FUNCTION public.resolve_product_options(p_product_family_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(catalog catalog_kind, sub_attribute text, item_code text, label text, sort_order integer, is_default boolean, is_enabled boolean, metadata jsonb, price_delta_minor integer, price_override_minor integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH links AS (
    SELECT pcl.*
    FROM public.product_catalog_links pcl
    WHERE pcl.product_family_id = p_product_family_id
      AND pcl.scope_type = 'master'
  ),
  resolved AS (
    SELECT
      l.catalog, l.sub_attribute, l.item_code,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.label FROM public.catalog_sizes cs WHERE cs.code = l.item_code AND cs.scope_type = 'master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.label FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code AND cpa.scope_type = 'master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT cp.label FROM public.catalog_papers cp WHERE cp.code = l.item_code AND cp.scope_type = 'master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT cf.label FROM public.catalog_finishing cf WHERE cf.code = l.item_code AND cf.scope_type = 'master' LIMIT 1)
      END AS label,
      l.sort_order, l.is_default,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.is_active FROM public.catalog_sizes cs WHERE cs.code = l.item_code AND cs.scope_type = 'master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.is_active FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code AND cpa.scope_type = 'master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT cp.is_active FROM public.catalog_papers cp WHERE cp.code = l.item_code AND cp.scope_type = 'master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT cf.is_active FROM public.catalog_finishing cf WHERE cf.code = l.item_code AND cf.scope_type = 'master' LIMIT 1)
      END AS master_active,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT jsonb_build_object('width_mm',cs.width_mm,'height_mm',cs.height_mm,'iso',cs.iso_name,'region',cs.region) || COALESCE(cs.metadata,'{}'::jsonb) FROM public.catalog_sizes cs WHERE cs.code = l.item_code AND cs.scope_type='master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.metadata FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code AND cpa.scope_type='master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT jsonb_build_object('weight_gsm',cp.weight_gsm,'finish',cp.finish,'category',cp.category) || COALESCE(cp.metadata,'{}'::jsonb) FROM public.catalog_papers cp WHERE cp.code = l.item_code AND cp.scope_type='master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT jsonb_build_object('category',cf.category,'variant',cf.variant,'pricing_basis',cf.pricing_basis) || COALESCE(cf.metadata,'{}'::jsonb) FROM public.catalog_finishing cf WHERE cf.code = l.item_code AND cf.scope_type='master' LIMIT 1)
      END AS master_metadata
    FROM links l
  )
  SELECT
    r.catalog, r.sub_attribute, r.item_code,
    COALESCE(bco.label_override, r.label) AS label,
    r.sort_order, r.is_default,
    COALESCE(r.master_active, true) AND COALESCE(bco.is_enabled, true) AS is_enabled,
    COALESCE(bco.metadata_override, r.master_metadata, '{}'::jsonb) AS metadata,
    bco.price_delta_minor, bco.price_override_minor
  FROM resolved r
  LEFT JOIN public.branch_catalog_overrides bco
    ON p_branch_id IS NOT NULL
   AND bco.branch_id = p_branch_id
   AND bco.catalog = r.catalog
   AND COALESCE(bco.sub_attribute,'') = COALESCE(r.sub_attribute,'')
   AND bco.item_code = r.item_code
  ORDER BY r.catalog, r.sub_attribute NULLS FIRST, r.sort_order, r.item_code;
$function$;