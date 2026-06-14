
-- 1. Add new columns to catalog_papers
ALTER TABLE public.catalog_papers
  ADD COLUMN IF NOT EXISTS stocked_sizes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_cover_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_edge_to_edge_only boolean NOT NULL DEFAULT false;

-- 2. Mark cover stocks
UPDATE public.catalog_papers
SET is_cover_stock = true
WHERE category = 'cover';

-- 3. Cull child-size prices: keep only parent sheets (A4, A3, SRA3).
-- Photo/poster stocks will need re-entry of size rows by the admin.
DELETE FROM public.catalog_paper_prices
WHERE lower(size_code) NOT IN ('a4','a3','sra3');

-- 4. Populate stocked_sizes from surviving price rows, per paper
UPDATE public.catalog_papers p
SET stocked_sizes = sub.sizes
FROM (
  SELECT paper_id, array_agg(DISTINCT lower(size_code) ORDER BY lower(size_code)) AS sizes
  FROM public.catalog_paper_prices
  GROUP BY paper_id
) sub
WHERE sub.paper_id = p.id;

-- 5. Default stocked_sizes for cover-only papers with no prices yet → SRA3
UPDATE public.catalog_papers
SET stocked_sizes = ARRAY['sra3']
WHERE stocked_sizes = '{}' AND is_cover_stock = true;

-- 6. Add printing_rules to product_families
ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS printing_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 7. Seed printing_rules per family slug (master rows only, tenant_id IS NULL)
UPDATE public.product_families SET printing_rules = jsonb_build_object(
  'allowed_finished_sizes', ARRAY['A4P','A5P'],
  'default_finished_size','A4P',
  'cover_is_heavy_stock', true,
  'force_sra3_when_edge_to_edge', true,
  'binding_size_inherits_from','A4',
  'min_quantity',1
) WHERE slug='bound-documents' AND tenant_id IS NULL;

UPDATE public.product_families SET printing_rules = jsonb_build_object(
  'allowed_finished_sizes', ARRAY['A5L','A4L','A3L'],
  'default_finished_size','A4L',
  'cover_is_heavy_stock', true,
  'force_sra3_when_edge_to_edge', true,
  'binding_size_inherits_from', null,
  'min_quantity',1
) WHERE slug='presentations' AND tenant_id IS NULL;

UPDATE public.product_families SET printing_rules = jsonb_build_object(
  'allowed_finished_sizes', ARRAY['A4P'],
  'default_finished_size','A4P',
  'cover_is_heavy_stock', true,
  'force_sra3_when_edge_to_edge', true,
  'binding_size_inherits_from', null,
  'min_quantity',1
) WHERE slug='ring-binders' AND tenant_id IS NULL;

UPDATE public.product_families SET printing_rules = jsonb_build_object(
  'allowed_finished_sizes', ARRAY['A4P','A5P'],
  'default_finished_size','A4P',
  'cover_is_heavy_stock', false,
  'force_sra3_when_edge_to_edge', true,
  'binding_size_inherits_from','A4',
  'min_quantity',1
) WHERE slug='stapled-loose-pages' AND tenant_id IS NULL;

UPDATE public.product_families SET printing_rules = jsonb_build_object(
  'allowed_finished_sizes', ARRAY['A5P','A5L','A4P'],
  'default_finished_size','A5P',
  'cover_is_heavy_stock', true,
  'force_sra3_when_edge_to_edge', true,
  'binding_size_inherits_from','A4',
  'min_quantity',1
) WHERE slug='booklets' AND tenant_id IS NULL;
