
-- =============================================================
-- 1. binding_specifications — reference data
-- =============================================================
CREATE TABLE public.binding_specifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  binding_method text NOT NULL,
  size_mm numeric NOT NULL,
  pitch text,
  min_sheets integer NOT NULL DEFAULT 1,
  max_sheets_80gsm integer NOT NULL,
  weight_grams numeric DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.binding_specifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read binding specs"
  ON public.binding_specifications FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Platform admins can manage binding specs"
  ON public.binding_specifications FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

-- Seed industry-standard data
INSERT INTO public.binding_specifications (binding_method, size_mm, pitch, min_sheets, max_sheets_80gsm, weight_grams, notes) VALUES
  -- Comb Binding (19-hole / 21-hole standard)
  ('comb', 6,  '19-hole', 2,   25,  3,  'Smallest comb'),
  ('comb', 10, '19-hole', 10,  55,  5,  NULL),
  ('comb', 12, '19-hole', 30,  90,  7,  NULL),
  ('comb', 16, '19-hole', 50,  130, 10, NULL),
  ('comb', 19, '19-hole', 80,  150, 12, NULL),
  ('comb', 22, '19-hole', 100, 180, 15, NULL),
  ('comb', 25, '19-hole', 120, 220, 18, NULL),
  ('comb', 32, '19-hole', 160, 280, 22, NULL),
  ('comb', 38, '19-hole', 200, 340, 28, NULL),
  ('comb', 45, '19-hole', 250, 400, 35, NULL),
  ('comb', 51, '19-hole', 300, 450, 42, 'Largest standard comb'),
  -- Wire 3:1 pitch (34-loop)
  ('wire_3_1', 6.4, '3:1 (34-loop)', 1,   25,  5,  NULL),
  ('wire_3_1', 8,   '3:1',           15,  45,  7,  NULL),
  ('wire_3_1', 9.5, '3:1',           25,  65,  9,  NULL),
  ('wire_3_1', 11,  '3:1',           40,  90,  12, NULL),
  ('wire_3_1', 12.7,'3:1',           60,  110, 15, NULL),
  ('wire_3_1', 14.3,'3:1',           75,  120, 18, 'Largest 3:1 wire commonly available'),
  -- Wire 2:1 pitch (23-loop)
  ('wire_2_1', 16,   '2:1 (23-loop)', 90,  135, 20, NULL),
  ('wire_2_1', 19,   '2:1',           100, 160, 25, NULL),
  ('wire_2_1', 22,   '2:1',           120, 190, 30, NULL),
  ('wire_2_1', 25.4, '2:1',           140, 220, 35, 'Largest 2:1 wire commonly available'),
  -- Spiral / Plastic Coil (4:1 pitch)
  ('spiral_coil', 6,  '4:1', 1,   15,  2,  NULL),
  ('spiral_coil', 8,  '4:1', 5,   30,  3,  NULL),
  ('spiral_coil', 10, '4:1', 15,  50,  5,  NULL),
  ('spiral_coil', 12, '4:1', 30,  75,  7,  NULL),
  ('spiral_coil', 14, '4:1', 45,  100, 9,  NULL),
  ('spiral_coil', 16, '4:1', 60,  120, 12, NULL),
  ('spiral_coil', 20, '4:1', 80,  160, 16, NULL),
  ('spiral_coil', 25, '4:1', 110, 200, 22, NULL),
  ('spiral_coil', 30, '4:1', 140, 250, 28, 'Largest standard spiral coil'),
  -- Saddle Stitch
  ('saddle_stitch', 0, NULL, 4, 40, 0, 'Max ~40 printed pages on most digital saddle stitchers. Page count must be divisible by 4.');

-- =============================================================
-- 2. product_price_overrides — tenant-level combo pricing
-- =============================================================
CREATE TABLE public.product_price_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_family_id uuid NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity_min integer DEFAULT 1,
  quantity_max integer,
  sell_price numeric NOT NULL,
  cost_price numeric DEFAULT 0,
  weight_grams numeric DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'ZAR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_price_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage own overrides"
  ON public.product_price_overrides FOR ALL
  TO authenticated
  USING (user_is_tenant_admin(tenant_id))
  WITH CHECK (user_is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins can manage all overrides"
  ON public.product_price_overrides FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE INDEX idx_overrides_tenant_family
  ON public.product_price_overrides (tenant_id, product_family_id);

-- =============================================================
-- 3. Add weight_grams to order_items
-- =============================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS weight_grams numeric DEFAULT 0;
