
-- Create pricing regions table
CREATE TABLE public.platform_pricing_regions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region_code text NOT NULL UNIQUE,
  region_label text NOT NULL,
  currency_code text NOT NULL,
  currency_symbol text NOT NULL,
  country_codes text[] NOT NULL DEFAULT '{}',
  tax_note text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create pricing plans table
CREATE TABLE public.platform_pricing_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES public.platform_pricing_regions(id) ON DELETE CASCADE,
  plan_slug text NOT NULL,
  plan_name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, plan_slug)
);

-- Enable RLS
ALTER TABLE public.platform_pricing_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_pricing_plans ENABLE ROW LEVEL SECURITY;

-- Public read for both tables (pricing page is public)
CREATE POLICY "anon_select_regions" ON public.platform_pricing_regions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_select_plans" ON public.platform_pricing_plans FOR SELECT TO anon, authenticated USING (true);

-- Platform admin write for regions
CREATE POLICY "platform_admin_all_regions" ON public.platform_pricing_regions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

-- Platform admin write for plans
CREATE POLICY "platform_admin_all_plans" ON public.platform_pricing_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

-- Updated_at triggers
CREATE TRIGGER set_updated_at_pricing_regions BEFORE UPDATE ON public.platform_pricing_regions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_pricing_plans BEFORE UPDATE ON public.platform_pricing_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed regions
INSERT INTO public.platform_pricing_regions (region_code, region_label, currency_code, currency_symbol, country_codes, tax_note, is_default, sort_order) VALUES
  ('US', 'United States', 'USD', '$', '{US,CA}', NULL, false, 1),
  ('UK', 'United Kingdom', 'GBP', '£', '{GB}', 'excl. VAT', true, 2),
  ('EU', 'Europe', 'EUR', '€', '{DE,FR,IT,ES,NL,BE,AT,PT,IE,FI,GR,LU,MT,CY,SK,SI,EE,LV,LT,HR}', 'excl. VAT', false, 3),
  ('AU', 'Australia', 'AUD', 'A$', '{AU,NZ}', 'excl. GST', false, 4),
  ('ZA', 'South Africa', 'ZAR', 'R', '{ZA}', 'excl. VAT', false, 5);

-- Seed plans
INSERT INTO public.platform_pricing_plans (region_id, plan_slug, plan_name, price, sort_order)
SELECT r.id, p.plan_slug, p.plan_name, p.price, p.sort_order
FROM (VALUES
  ('US', 'starter', 'Starter', 149.00, 1),
  ('US', 'core', 'Core', 199.00, 2),
  ('US', 'multi_branch', 'Multi-Branch', 349.00, 3),
  ('UK', 'starter', 'Starter', 119.00, 1),
  ('UK', 'core', 'Core', 149.00, 2),
  ('UK', 'multi_branch', 'Multi-Branch', 259.00, 3),
  ('EU', 'starter', 'Starter', 129.00, 1),
  ('EU', 'core', 'Core', 169.00, 2),
  ('EU', 'multi_branch', 'Multi-Branch', 299.00, 3),
  ('AU', 'starter', 'Starter', 219.00, 1),
  ('AU', 'core', 'Core', 279.00, 2),
  ('AU', 'multi_branch', 'Multi-Branch', 479.00, 3),
  ('ZA', 'starter', 'Starter', 1799.00, 1),
  ('ZA', 'core', 'Core', 2499.00, 2),
  ('ZA', 'multi_branch', 'Multi-Branch', 4499.00, 3)
) AS p(region_code, plan_slug, plan_name, price, sort_order)
JOIN public.platform_pricing_regions r ON r.region_code = p.region_code;
