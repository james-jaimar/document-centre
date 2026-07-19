
-- ============================================================================
-- catalog_variants — master list of product variant tiers (Economy, Executive, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.catalog_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_variants TO authenticated;
GRANT ALL ON public.catalog_variants TO service_role;
ALTER TABLE public.catalog_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_variants read all" ON public.catalog_variants
  FOR SELECT USING (true);
CREATE POLICY "catalog_variants platform write" ON public.catalog_variants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER catalog_variants_set_updated_at BEFORE UPDATE ON public.catalog_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the two starter variants for the pull-up banner use case.
INSERT INTO public.catalog_variants (code, label, description, sort_order)
VALUES
  ('economy',   'Economy',   'Standard base / entry-level tier', 10),
  ('executive', 'Executive', 'Premium base / upgraded tier',     20)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- product_variant_links — which variants each product family offers
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_variant_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  catalog_variant_id uuid NOT NULL REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_family_id, catalog_variant_id)
);
GRANT SELECT ON public.product_variant_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_links TO authenticated;
GRANT ALL ON public.product_variant_links TO service_role;
ALTER TABLE public.product_variant_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pvl read all" ON public.product_variant_links
  FOR SELECT USING (true);
CREATE POLICY "pvl platform write" ON public.product_variant_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER pvl_set_updated_at BEFORE UPDATE ON public.product_variant_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only one default per family.
CREATE UNIQUE INDEX IF NOT EXISTS pvl_one_default_per_family
  ON public.product_variant_links(product_family_id)
  WHERE is_default;

-- ============================================================================
-- variant_code discriminator on pricing + order tables (NULL = variant-agnostic)
-- ============================================================================
ALTER TABLE public.rate_card_clicks
  ADD COLUMN IF NOT EXISTS variant_code text;

-- Rebuild the uniqueness indexes so a size/colour/sides can exist once per variant.
DROP INDEX IF EXISTS public.rcc_master_unique;
DROP INDEX IF EXISTS public.rcc_tenant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS rcc_master_unique
  ON public.rate_card_clicks(size, colour, sides, COALESCE(variant_code, ''))
  WHERE scope_type = 'master';
CREATE UNIQUE INDEX IF NOT EXISTS rcc_tenant_unique
  ON public.rate_card_clicks(tenant_id, size, colour, sides, COALESCE(variant_code, ''))
  WHERE scope_type = 'tenant';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_code text;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS variant_code text;

ALTER TABLE public.product_pack_pricing_overrides
  ADD COLUMN IF NOT EXISTS variant_code text;
