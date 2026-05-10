
-- ============================================================================
-- Master Rate Card schema
-- ============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.rate_card_scope AS ENUM ('master','tenant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.click_size AS ENUM ('A4','A3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.click_colour AS ENUM ('mono','colour');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.click_sides AS ENUM ('simplex','duplex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.finishing_basis AS ENUM (
    'per_unit','per_sheet','per_set','per_cut','per_document','per_page'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- rate_card_clicks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_card_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type public.rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  size public.click_size NOT NULL,
  colour public.click_colour NOT NULL,
  sides public.click_sides NOT NULL,
  sell_price numeric(10,4) NOT NULL DEFAULT 0,
  cost_price numeric(10,4) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rcc_scope_tenant_chk CHECK (
    (scope_type = 'master' AND tenant_id IS NULL) OR
    (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rcc_master_unique
  ON public.rate_card_clicks(size, colour, sides)
  WHERE scope_type = 'master';

CREATE UNIQUE INDEX IF NOT EXISTS rcc_tenant_unique
  ON public.rate_card_clicks(tenant_id, size, colour, sides)
  WHERE scope_type = 'tenant';

ALTER TABLE public.rate_card_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcc_read_all ON public.rate_card_clicks
  FOR SELECT USING (is_active = true OR scope_type = 'master' OR
    (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id)));

CREATE POLICY rcc_master_write_platform_admin ON public.rate_card_clicks
  FOR ALL TO authenticated
  USING (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rcc_tenant_write_admin ON public.rate_card_clicks
  FOR ALL TO authenticated
  USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER rcc_set_updated_at BEFORE UPDATE ON public.rate_card_clicks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- rate_card_papers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_card_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type public.rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  weight_gsm integer NOT NULL,
  finish text NOT NULL DEFAULT 'bond',  -- bond, gloss, matt, silk, recycled
  size public.click_size NOT NULL,
  sell_price numeric(10,4) NOT NULL DEFAULT 0,
  cost_price numeric(10,4) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rcp_scope_tenant_chk CHECK (
    (scope_type = 'master' AND tenant_id IS NULL) OR
    (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rcp_master_code_unique
  ON public.rate_card_papers(code) WHERE scope_type = 'master';

CREATE UNIQUE INDEX IF NOT EXISTS rcp_tenant_code_unique
  ON public.rate_card_papers(tenant_id, code) WHERE scope_type = 'tenant';

ALTER TABLE public.rate_card_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcp_read_all ON public.rate_card_papers
  FOR SELECT USING (is_active = true OR scope_type = 'master' OR
    (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id)));

CREATE POLICY rcp_master_write_platform_admin ON public.rate_card_papers
  FOR ALL TO authenticated
  USING (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rcp_tenant_write_admin ON public.rate_card_papers
  FOR ALL TO authenticated
  USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER rcp_set_updated_at BEFORE UPDATE ON public.rate_card_papers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- rate_card_finishing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_card_finishing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type public.rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,                  -- e.g. comb-binding-10mm, lamination-a4-gloss
  label text NOT NULL,
  category text NOT NULL,              -- binding, lamination, stapling, folding, trimming, cover, guillotining, other
  pricing_basis public.finishing_basis NOT NULL,
  variant text,                        -- e.g. "10mm", "gloss"
  size public.click_size,              -- nullable when not size-specific
  sell_price numeric(10,4) NOT NULL DEFAULT 0,
  cost_price numeric(10,4) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rcf_scope_tenant_chk CHECK (
    (scope_type = 'master' AND tenant_id IS NULL) OR
    (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rcf_master_code_unique
  ON public.rate_card_finishing(code) WHERE scope_type = 'master';

CREATE UNIQUE INDEX IF NOT EXISTS rcf_tenant_code_unique
  ON public.rate_card_finishing(tenant_id, code) WHERE scope_type = 'tenant';

ALTER TABLE public.rate_card_finishing ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcf_read_all ON public.rate_card_finishing
  FOR SELECT USING (is_active = true OR scope_type = 'master' OR
    (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id)));

CREATE POLICY rcf_master_write_platform_admin ON public.rate_card_finishing
  FOR ALL TO authenticated
  USING (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rcf_tenant_write_admin ON public.rate_card_finishing
  FOR ALL TO authenticated
  USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER rcf_set_updated_at BEFORE UPDATE ON public.rate_card_finishing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- product_recipes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_recipes (
  product_family_id uuid PRIMARY KEY REFERENCES public.product_families(id) ON DELETE CASCADE,
  recipe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pr_read_all ON public.product_recipes FOR SELECT USING (true);

CREATE POLICY pr_write_platform_admin ON public.product_recipes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER pr_set_updated_at BEFORE UPDATE ON public.product_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Clone function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clicks
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, sell_price, cost_price, is_active)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.sell_price, m.cost_price, m.is_active
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND t.size = m.size AND t.colour = m.colour AND t.sides = m.sides
    );

  -- Papers
  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, code, label, weight_gsm, finish, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_papers m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_papers t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  -- Finishing
  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, code, label, category, pricing_basis, variant, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.pricing_basis, m.variant, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_finishing m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_finishing t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Master seed (idempotent - only seeds if no master rows exist yet)
-- ----------------------------------------------------------------------------
INSERT INTO public.rate_card_clicks (scope_type, size, colour, sides, sell_price)
SELECT 'master', s::click_size, c::click_colour, d::click_sides, p
FROM (VALUES
  ('A4','mono','simplex',0.50),
  ('A4','mono','duplex',0.90),
  ('A4','colour','simplex',2.50),
  ('A4','colour','duplex',4.50),
  ('A3','mono','simplex',1.00),
  ('A3','mono','duplex',1.80),
  ('A3','colour','simplex',5.00),
  ('A3','colour','duplex',9.00)
) v(s,c,d,p)
WHERE NOT EXISTS (SELECT 1 FROM public.rate_card_clicks WHERE scope_type='master');

INSERT INTO public.rate_card_papers (scope_type, code, label, weight_gsm, finish, size, sell_price, sort_order)
SELECT 'master', code, label, gsm, finish, sz::click_size, price, ord
FROM (VALUES
  ('80gsm-bond-a4','80gsm Bond A4',80,'bond','A4',0.20,10),
  ('80gsm-bond-a3','80gsm Bond A3',80,'bond','A3',0.40,11),
  ('100gsm-bond-a4','100gsm Bond A4',100,'bond','A4',0.30,20),
  ('100gsm-bond-a3','100gsm Bond A3',100,'bond','A3',0.60,21),
  ('135gsm-gloss-a4','135gsm Gloss A4',135,'gloss','A4',0.80,30),
  ('135gsm-gloss-a3','135gsm Gloss A3',135,'gloss','A3',1.60,31),
  ('170gsm-gloss-a4','170gsm Gloss A4',170,'gloss','A4',1.20,40),
  ('170gsm-gloss-a3','170gsm Gloss A3',170,'gloss','A3',2.40,41),
  ('250gsm-gloss-a4','250gsm Gloss A4',250,'gloss','A4',1.80,50),
  ('250gsm-matt-a4','250gsm Matt A4',250,'matt','A4',1.80,51),
  ('300gsm-gloss-a4','300gsm Gloss A4',300,'gloss','A4',2.20,60),
  ('350gsm-matt-a4','350gsm Matt A4',350,'matt','A4',2.80,70)
) v(code,label,gsm,finish,sz,price,ord)
WHERE NOT EXISTS (SELECT 1 FROM public.rate_card_papers WHERE scope_type='master');

INSERT INTO public.rate_card_finishing (scope_type, code, label, category, pricing_basis, variant, size, sell_price, sort_order)
SELECT 'master', code, label, cat, basis::finishing_basis, variant, sz::click_size, price, ord
FROM (VALUES
  -- Binding (per book, by spine size)
  ('comb-6mm','Comb Binding 6mm','binding','per_unit','6mm',NULL,12.00,10),
  ('comb-10mm','Comb Binding 10mm','binding','per_unit','10mm',NULL,15.00,11),
  ('comb-16mm','Comb Binding 16mm','binding','per_unit','16mm',NULL,20.00,12),
  ('comb-25mm','Comb Binding 25mm','binding','per_unit','25mm',NULL,28.00,13),
  ('wire-8mm','Wire Binding 8mm','binding','per_unit','8mm',NULL,18.00,20),
  ('wire-12mm','Wire Binding 12mm','binding','per_unit','12mm',NULL,24.00,21),
  ('spiral-10mm','Spiral Binding 10mm','binding','per_unit','10mm',NULL,16.00,30),
  ('spiral-16mm','Spiral Binding 16mm','binding','per_unit','16mm',NULL,22.00,31),
  ('saddle-stitch','Saddle Stitch (staple)','stapling','per_unit',NULL,NULL,3.00,40),
  -- Covers (per sheet)
  ('acetate-cover-a4','Acetate Cover A4','cover','per_sheet',NULL,'A4',6.00,50),
  ('acetate-cover-a3','Acetate Cover A3','cover','per_sheet',NULL,'A3',12.00,51),
  ('card-back-a4','Card Back A4 (250gsm)','cover','per_sheet',NULL,'A4',2.50,60),
  ('card-back-a3','Card Back A3 (250gsm)','cover','per_sheet',NULL,'A3',5.00,61),
  -- Lamination (per sheet, by size)
  ('lamination-a4-gloss','Lamination A4 Gloss','lamination','per_sheet','gloss','A4',8.00,70),
  ('lamination-a3-gloss','Lamination A3 Gloss','lamination','per_sheet','gloss','A3',16.00,71),
  ('lamination-a4-matt','Lamination A4 Matt','lamination','per_sheet','matt','A4',9.00,72),
  ('lamination-a3-matt','Lamination A3 Matt','lamination','per_sheet','matt','A3',18.00,73),
  -- Folding (per piece)
  ('fold-bi','Bi-Fold','folding','per_unit','bi',NULL,0.50,80),
  ('fold-tri','Tri-Fold','folding','per_unit','tri',NULL,0.80,81),
  ('fold-z','Z-Fold','folding','per_unit','z',NULL,0.80,82),
  -- Cutting / trimming
  ('guillotine-flyer','Guillotine (flyers)','guillotining','per_unit',NULL,NULL,0.10,90),
  ('trim-bcards','Business Card Trim','trimming','per_set',NULL,NULL,15.00,91),
  -- Ring binders
  ('ring-binder-25mm','Ring Binder 25mm','binding','per_unit','25mm',NULL,45.00,100),
  ('ring-binder-50mm','Ring Binder 50mm','binding','per_unit','50mm',NULL,65.00,101),
  ('ring-binder-75mm','Ring Binder 75mm','binding','per_unit','75mm',NULL,85.00,102)
) v(code,label,cat,basis,variant,sz,price,ord)
WHERE NOT EXISTS (SELECT 1 FROM public.rate_card_finishing WHERE scope_type='master');

-- Auto-clone master to all existing tenants
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE is_active = true LOOP
    PERFORM public.clone_master_rate_card_to_tenant(r.id);
  END LOOP;
END $$;
