
DO $$ BEGIN
  CREATE TYPE public.catalog_kind AS ENUM ('size','print_attr','paper','finishing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- catalog_sizes
CREATE TABLE public.catalog_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  width_mm numeric NOT NULL,
  height_mm numeric NOT NULL,
  iso_name text,
  region text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_sizes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_sizes TO authenticated;
GRANT ALL ON public.catalog_sizes TO service_role;
ALTER TABLE public.catalog_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_sizes read all" ON public.catalog_sizes FOR SELECT USING (true);
CREATE POLICY "catalog_sizes platform write" ON public.catalog_sizes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- catalog_print_attrs
CREATE TABLE public.catalog_print_attrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attribute, code)
);
GRANT SELECT ON public.catalog_print_attrs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_print_attrs TO authenticated;
GRANT ALL ON public.catalog_print_attrs TO service_role;
ALTER TABLE public.catalog_print_attrs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_print_attrs read all" ON public.catalog_print_attrs FOR SELECT USING (true);
CREATE POLICY "catalog_print_attrs platform write" ON public.catalog_print_attrs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- catalog_papers
CREATE TABLE public.catalog_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  weight_gsm integer,
  finish text,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_papers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_papers TO authenticated;
GRANT ALL ON public.catalog_papers TO service_role;
ALTER TABLE public.catalog_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_papers read all" ON public.catalog_papers FOR SELECT USING (true);
CREATE POLICY "catalog_papers platform write" ON public.catalog_papers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TABLE public.catalog_paper_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.catalog_papers(id) ON DELETE CASCADE,
  size_code text NOT NULL REFERENCES public.catalog_sizes(code) ON DELETE RESTRICT,
  sell_price_minor integer NOT NULL DEFAULT 0,
  cost_price_minor integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_id, size_code)
);
GRANT SELECT ON public.catalog_paper_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_paper_prices TO authenticated;
GRANT ALL ON public.catalog_paper_prices TO service_role;
ALTER TABLE public.catalog_paper_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_paper_prices read all" ON public.catalog_paper_prices FOR SELECT USING (true);
CREATE POLICY "catalog_paper_prices platform write" ON public.catalog_paper_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- catalog_finishing
CREATE TABLE public.catalog_finishing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text,
  variant text,
  pricing_basis text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_finishing TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_finishing TO authenticated;
GRANT ALL ON public.catalog_finishing TO service_role;
ALTER TABLE public.catalog_finishing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_finishing read all" ON public.catalog_finishing FOR SELECT USING (true);
CREATE POLICY "catalog_finishing platform write" ON public.catalog_finishing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TABLE public.catalog_finishing_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finishing_id uuid NOT NULL REFERENCES public.catalog_finishing(id) ON DELETE CASCADE,
  size_code text REFERENCES public.catalog_sizes(code) ON DELETE RESTRICT,
  sell_price_minor integer NOT NULL DEFAULT 0,
  cost_price_minor integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_finishing_prices_uniq
  ON public.catalog_finishing_prices (finishing_id, COALESCE(size_code, '__any__'));
GRANT SELECT ON public.catalog_finishing_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_finishing_prices TO authenticated;
GRANT ALL ON public.catalog_finishing_prices TO service_role;
ALTER TABLE public.catalog_finishing_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_finishing_prices read all" ON public.catalog_finishing_prices FOR SELECT USING (true);
CREATE POLICY "catalog_finishing_prices platform write" ON public.catalog_finishing_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- product_catalog_links
CREATE TABLE public.product_catalog_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  catalog public.catalog_kind NOT NULL,
  sub_attribute text,
  item_code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_catalog_links_uniq
  ON public.product_catalog_links (product_family_id, catalog, COALESCE(sub_attribute,''), item_code);
GRANT SELECT ON public.product_catalog_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_catalog_links TO authenticated;
GRANT ALL ON public.product_catalog_links TO service_role;
ALTER TABLE public.product_catalog_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_catalog_links read all" ON public.product_catalog_links FOR SELECT USING (true);
CREATE POLICY "product_catalog_links tenant write" ON public.product_catalog_links
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.product_families pf
      WHERE pf.id = product_catalog_links.product_family_id
        AND (pf.tenant_id IS NULL OR public.user_is_tenant_admin(pf.tenant_id))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.product_families pf
      WHERE pf.id = product_catalog_links.product_family_id
        AND (pf.tenant_id IS NULL OR public.user_is_tenant_admin(pf.tenant_id))
    )
  );

-- branch_catalog_overrides
CREATE TABLE public.branch_catalog_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  catalog public.catalog_kind NOT NULL,
  sub_attribute text,
  item_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  label_override text,
  metadata_override jsonb,
  price_delta_minor integer,
  price_override_minor integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX branch_catalog_overrides_uniq
  ON public.branch_catalog_overrides (branch_id, catalog, COALESCE(sub_attribute,''), item_code);
GRANT SELECT ON public.branch_catalog_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_catalog_overrides TO authenticated;
GRANT ALL ON public.branch_catalog_overrides TO service_role;
ALTER TABLE public.branch_catalog_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branch_catalog_overrides read all" ON public.branch_catalog_overrides FOR SELECT USING (true);
CREATE POLICY "branch_catalog_overrides tenant write" ON public.branch_catalog_overrides
  FOR ALL TO authenticated
  USING (public.user_can_manage_branch(branch_id))
  WITH CHECK (public.user_can_manage_branch(branch_id));

-- updated_at triggers
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'catalog_sizes','catalog_print_attrs','catalog_papers','catalog_paper_prices',
    'catalog_finishing','catalog_finishing_prices','product_catalog_links','branch_catalog_overrides'
  ]) LOOP
    EXECUTE format('CREATE TRIGGER touch_%1$s BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- Seed sizes
INSERT INTO public.catalog_sizes (code,label,width_mm,height_mm,iso_name,region,sort_order) VALUES
  ('a6','A6',105,148,'A6','ISO',10),
  ('a5','A5',148,210,'A5','ISO',20),
  ('a4','A4',210,297,'A4','ISO',30),
  ('a4-landscape','A4 Landscape',297,210,'A4','ISO',31),
  ('a3','A3',297,420,'A3','ISO',40),
  ('a2','A2',420,594,'A2','ISO',50),
  ('a1','A1',594,841,'A1','ISO',60),
  ('a0','A0',841,1189,'A0','ISO',70),
  ('sra3','SRA3',320,450,'SRA3','ISO',45),
  ('dl','DL',99,210,'DL','ISO',15),
  ('us-letter','US Letter',215.9,279.4,'Letter','US',100),
  ('us-legal','US Legal',215.9,355.6,'Legal','US',110),
  ('tabloid','Tabloid',279.4,431.8,'Tabloid','US',120)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.catalog_print_attrs (attribute,code,label,sort_order) VALUES
  ('colour_mode','mono','Black & White',10),
  ('colour_mode','colour','Full Colour',20),
  ('colour_mode','mixed','Mixed',30),
  ('sides','simplex','Single-sided',10),
  ('sides','duplex','Double-sided',20),
  ('sides','mixed','Mixed',30),
  ('orientation','portrait','Portrait',10),
  ('orientation','landscape','Landscape',20)
ON CONFLICT (attribute,code) DO NOTHING;

-- Back-fill product_catalog_links: Document Size
INSERT INTO public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
SELECT DISTINCT
  po.product_family_id, 'size'::public.catalog_kind, NULL, cs.code,
  COALESCE((v->>'sort_order')::int, 0),
  COALESCE((v->>'is_default')::boolean, false)
FROM public.product_options po
CROSS JOIN LATERAL jsonb_array_elements(po.values) AS v
JOIN public.catalog_sizes cs
  ON cs.code = lower(v->>'slug')
  OR lower(cs.iso_name) = lower(v->>'slug')
  OR lower(cs.label) = lower(v->>'label')
WHERE lower(po.name) IN ('document size','paper size','size')
  AND jsonb_typeof(po.values) = 'array'
ON CONFLICT DO NOTHING;

-- Print Colour
INSERT INTO public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
SELECT DISTINCT
  po.product_family_id, 'print_attr'::public.catalog_kind, 'colour_mode', cpa.code,
  COALESCE((v->>'sort_order')::int, 0),
  COALESCE((v->>'is_default')::boolean, false)
FROM public.product_options po
CROSS JOIN LATERAL jsonb_array_elements(po.values) AS v
JOIN public.catalog_print_attrs cpa
  ON cpa.attribute = 'colour_mode'
 AND (cpa.code = lower(v->>'slug') OR lower(cpa.label) = lower(v->>'label'))
WHERE lower(po.name) IN ('print colour','print color','colour','color','colour mode')
  AND jsonb_typeof(po.values) = 'array'
ON CONFLICT DO NOTHING;

-- Sides
INSERT INTO public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
SELECT DISTINCT
  po.product_family_id, 'print_attr'::public.catalog_kind, 'sides', cpa.code,
  COALESCE((v->>'sort_order')::int, 0),
  COALESCE((v->>'is_default')::boolean, false)
FROM public.product_options po
CROSS JOIN LATERAL jsonb_array_elements(po.values) AS v
JOIN public.catalog_print_attrs cpa
  ON cpa.attribute = 'sides'
 AND (cpa.code = lower(v->>'slug') OR lower(cpa.label) = lower(v->>'label'))
WHERE lower(po.name) IN ('print sides','sides','duplex')
  AND jsonb_typeof(po.values) = 'array'
ON CONFLICT DO NOTHING;

-- Orientation
INSERT INTO public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
SELECT DISTINCT
  po.product_family_id, 'print_attr'::public.catalog_kind, 'orientation', cpa.code,
  COALESCE((v->>'sort_order')::int, 0),
  COALESCE((v->>'is_default')::boolean, false)
FROM public.product_options po
CROSS JOIN LATERAL jsonb_array_elements(po.values) AS v
JOIN public.catalog_print_attrs cpa
  ON cpa.attribute = 'orientation'
 AND (cpa.code = lower(v->>'slug') OR lower(cpa.label) = lower(v->>'label'))
WHERE lower(po.name) IN ('orientation')
  AND jsonb_typeof(po.values) = 'array'
ON CONFLICT DO NOTHING;

-- Migrate branch_product_option_overrides -> branch_catalog_overrides
INSERT INTO public.branch_catalog_overrides (branch_id, catalog, sub_attribute, item_code, is_enabled)
SELECT DISTINCT bpo.branch_id, pcl.catalog, pcl.sub_attribute, pcl.item_code, bpo.is_enabled
FROM public.branch_product_option_overrides bpo
JOIN public.product_options po ON po.id = bpo.product_option_id
JOIN public.product_catalog_links pcl ON pcl.product_family_id = po.product_family_id
WHERE
  (lower(po.name) IN ('document size','paper size','size')
     AND pcl.catalog = 'size'
     AND pcl.item_code = (
        SELECT cs.code FROM public.catalog_sizes cs
        WHERE cs.code = lower(bpo.value_slug)
           OR lower(cs.iso_name) = lower(bpo.value_slug)
        LIMIT 1
     ))
  OR (lower(po.name) IN ('print colour','print color','colour','color','colour mode')
     AND pcl.catalog = 'print_attr' AND pcl.sub_attribute = 'colour_mode'
     AND pcl.item_code = lower(bpo.value_slug))
  OR (lower(po.name) IN ('print sides','sides','duplex')
     AND pcl.catalog = 'print_attr' AND pcl.sub_attribute = 'sides'
     AND pcl.item_code = lower(bpo.value_slug))
  OR (lower(po.name) IN ('orientation')
     AND pcl.catalog = 'print_attr' AND pcl.sub_attribute = 'orientation'
     AND pcl.item_code = lower(bpo.value_slug))
ON CONFLICT DO NOTHING;

-- Resolver
CREATE OR REPLACE FUNCTION public.resolve_product_options(
  p_product_family_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  catalog public.catalog_kind,
  sub_attribute text,
  item_code text,
  label text,
  sort_order integer,
  is_default boolean,
  is_enabled boolean,
  metadata jsonb,
  price_delta_minor integer,
  price_override_minor integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH links AS (
    SELECT pcl.*
    FROM public.product_catalog_links pcl
    WHERE pcl.product_family_id = p_product_family_id
  ),
  resolved AS (
    SELECT
      l.catalog, l.sub_attribute, l.item_code,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.label FROM public.catalog_sizes cs WHERE cs.code = l.item_code)
        WHEN 'print_attr' THEN (SELECT cpa.label FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code)
        WHEN 'paper'      THEN (SELECT cp.label FROM public.catalog_papers cp WHERE cp.code = l.item_code)
        WHEN 'finishing'  THEN (SELECT cf.label FROM public.catalog_finishing cf WHERE cf.code = l.item_code)
      END AS label,
      l.sort_order, l.is_default,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT cs.is_active FROM public.catalog_sizes cs WHERE cs.code = l.item_code)
        WHEN 'print_attr' THEN (SELECT cpa.is_active FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code)
        WHEN 'paper'      THEN (SELECT cp.is_active FROM public.catalog_papers cp WHERE cp.code = l.item_code)
        WHEN 'finishing'  THEN (SELECT cf.is_active FROM public.catalog_finishing cf WHERE cf.code = l.item_code)
      END AS master_active,
      CASE l.catalog
        WHEN 'size'       THEN (SELECT jsonb_build_object('width_mm',cs.width_mm,'height_mm',cs.height_mm,'iso',cs.iso_name,'region',cs.region) || cs.metadata FROM public.catalog_sizes cs WHERE cs.code = l.item_code)
        WHEN 'print_attr' THEN (SELECT cpa.metadata FROM public.catalog_print_attrs cpa WHERE cpa.attribute = l.sub_attribute AND cpa.code = l.item_code)
        WHEN 'paper'      THEN (SELECT jsonb_build_object('weight_gsm',cp.weight_gsm,'finish',cp.finish,'category',cp.category) || cp.metadata FROM public.catalog_papers cp WHERE cp.code = l.item_code)
        WHEN 'finishing'  THEN (SELECT jsonb_build_object('category',cf.category,'variant',cf.variant,'pricing_basis',cf.pricing_basis) || cf.metadata FROM public.catalog_finishing cf WHERE cf.code = l.item_code)
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
$$;

GRANT EXECUTE ON FUNCTION public.resolve_product_options(uuid, uuid) TO anon, authenticated;
