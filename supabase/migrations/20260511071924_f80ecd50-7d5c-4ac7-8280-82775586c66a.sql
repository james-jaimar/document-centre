
-- ============================================================================
-- Rate card: dynamic click sizes + Photo Prints table
-- ============================================================================

-- 1. Convert click_size enum columns to text so admins can add SRA3/A5/photo sizes
ALTER TABLE public.rate_card_clicks  ALTER COLUMN size TYPE text USING size::text;
ALTER TABLE public.rate_card_papers  ALTER COLUMN size TYPE text USING size::text;
ALTER TABLE public.rate_card_finishing ALTER COLUMN size TYPE text USING size::text;

-- 2. Photo Prints rate card table
CREATE TABLE IF NOT EXISTS public.rate_card_photo_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type public.rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  size_slug text NOT NULL,
  width_mm numeric(8,2) NOT NULL,
  height_mm numeric(8,2) NOT NULL,
  finish text NOT NULL DEFAULT 'gloss',
  border_mm numeric(6,2) NOT NULL DEFAULT 0,
  sell_price numeric(10,4) NOT NULL DEFAULT 0,
  cost_price numeric(10,4) NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rcpp_scope_tenant_chk CHECK (
    (scope_type = 'master' AND tenant_id IS NULL) OR
    (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rcpp_master_unique
  ON public.rate_card_photo_prints(code) WHERE scope_type = 'master';
CREATE UNIQUE INDEX IF NOT EXISTS rcpp_tenant_unique
  ON public.rate_card_photo_prints(tenant_id, code) WHERE scope_type = 'tenant';

ALTER TABLE public.rate_card_photo_prints ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcpp_read_all ON public.rate_card_photo_prints
  FOR SELECT USING (true);

CREATE POLICY rcpp_master_write_platform_admin ON public.rate_card_photo_prints
  FOR ALL TO authenticated
  USING (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rcpp_tenant_write_admin ON public.rate_card_photo_prints
  FOR ALL TO authenticated
  USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER rcpp_set_updated_at BEFORE UPDATE ON public.rate_card_photo_prints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Extend clone function to also copy photo prints
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, code, label, size_slug, width_mm, height_mm, finish, border_mm,
     sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.size_slug, m.width_mm, m.height_mm, m.finish, m.border_mm,
         m.sell_price, m.cost_price, m.min_quantity, m.sort_order, m.is_active
  FROM public.rate_card_photo_prints m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );
END;
$$;

-- 4. Seed master photo prints (gloss + matte, no border + 3mm white border)
INSERT INTO public.rate_card_photo_prints
  (scope_type, code, label, size_slug, width_mm, height_mm, finish, border_mm, sell_price, sort_order)
SELECT 'master', code, label, size_slug, w, h, finish, border, price, ord
FROM (VALUES
  ('4x6-gloss',         '4×6" Gloss',          '4x6',  152, 102, 'gloss',  0, 3.50, 100),
  ('4x6-gloss-border',  '4×6" Gloss + Border', '4x6',  152, 102, 'gloss',  3, 4.00, 101),
  ('4x6-matte',         '4×6" Matte',          '4x6',  152, 102, 'matte',  0, 3.50, 102),
  ('5x7-gloss',         '5×7" Gloss',          '5x7',  178, 127, 'gloss',  0, 5.50, 110),
  ('5x7-matte',         '5×7" Matte',          '5x7',  178, 127, 'matte',  0, 5.50, 111),
  ('6x8-gloss',         '6×8" Gloss',          '6x8',  203, 152, 'gloss',  0, 8.00, 120),
  ('6x8-matte',         '6×8" Matte',          '6x8',  203, 152, 'matte',  0, 8.00, 121),
  ('8x10-gloss',        '8×10" Gloss',         '8x10', 254, 203, 'gloss',  0, 12.00, 130),
  ('8x10-matte',        '8×10" Matte',         '8x10', 254, 203, 'matte',  0, 12.00, 131),
  ('a4-gloss',          'A4 Gloss',            'a4',   297, 210, 'gloss',  0, 15.00, 140),
  ('a4-matte',          'A4 Matte',            'a4',   297, 210, 'matte',  0, 15.00, 141)
) v(code,label,size_slug,w,h,finish,border,price,ord)
WHERE NOT EXISTS (SELECT 1 FROM public.rate_card_photo_prints WHERE scope_type='master' AND rate_card_photo_prints.code = v.code);
