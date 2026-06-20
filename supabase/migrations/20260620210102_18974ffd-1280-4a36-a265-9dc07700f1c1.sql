
-- Tenant-level catalog overrides: default on/off (and label/price overrides)
-- applied between master and branch. Branch overrides still take precedence.
CREATE TABLE public.tenant_catalog_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  catalog catalog_kind NOT NULL,
  sub_attribute TEXT,
  item_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  label_override TEXT,
  metadata_override JSONB,
  price_delta_minor INTEGER,
  price_override_minor INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenant_catalog_overrides_uq
  ON public.tenant_catalog_overrides (tenant_id, catalog, COALESCE(sub_attribute,''), item_code);

CREATE INDEX tenant_catalog_overrides_tenant_idx
  ON public.tenant_catalog_overrides (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_catalog_overrides TO authenticated;
GRANT ALL ON public.tenant_catalog_overrides TO service_role;

ALTER TABLE public.tenant_catalog_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins manage their own tenant overrides"
  ON public.tenant_catalog_overrides
  FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- Allow any tenant member to read (so storefront resolver works for customers
-- and branch staff that aren't full tenant admins).
CREATE POLICY "Tenant members can read tenant overrides"
  ON public.tenant_catalog_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = tenant_catalog_overrides.tenant_id
        AND tm.is_active = true
    )
  );

CREATE TRIGGER set_tenant_catalog_overrides_updated_at
  BEFORE UPDATE ON public.tenant_catalog_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend resolver: master -> tenant override -> branch override.
-- Resolved tenant_id comes from the branch (when branch given) or stays NULL.
CREATE OR REPLACE FUNCTION public.resolve_product_options(
  p_product_family_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(
  catalog catalog_kind, sub_attribute text, item_code text, label text,
  sort_order integer, is_default boolean, is_enabled boolean, metadata jsonb,
  price_delta_minor integer, price_override_minor integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH effective_tenant AS (
    SELECT COALESCE(
      p_tenant_id,
      (SELECT tenant_id FROM public.branches WHERE id = p_branch_id)
    ) AS tid
  ),
  links AS (
    SELECT pcl.*
    FROM public.product_catalog_links pcl
    WHERE pcl.product_family_id = p_product_family_id
      AND pcl.scope_type = 'master'
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
        WHEN 'size'       THEN (SELECT jsonb_build_object('width_mm',cs.width_mm,'height_mm',cs.height_mm,'iso',cs.iso_name,'region',cs.region) || COALESCE(cs.metadata,'{}'::jsonb) FROM public.catalog_sizes cs WHERE cs.code=l.item_code AND cs.scope_type='master' LIMIT 1)
        WHEN 'print_attr' THEN (SELECT cpa.metadata FROM public.catalog_print_attrs cpa WHERE cpa.attribute=l.sub_attribute AND cpa.code=l.item_code AND cpa.scope_type='master' LIMIT 1)
        WHEN 'paper'      THEN (SELECT jsonb_build_object('weight_gsm',cp.weight_gsm,'finish',cp.finish,'category',cp.category) || COALESCE(cp.metadata,'{}'::jsonb) FROM public.catalog_papers cp WHERE cp.code=l.item_code AND cp.scope_type='master' LIMIT 1)
        WHEN 'finishing'  THEN (SELECT jsonb_build_object('category',cf.category,'variant',cf.variant,'pricing_basis',cf.pricing_basis) || COALESCE(cf.metadata,'{}'::jsonb) FROM public.catalog_finishing cf WHERE cf.code=l.item_code AND cf.scope_type='master' LIMIT 1)
      END AS master_metadata
    FROM links l
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
$$;
