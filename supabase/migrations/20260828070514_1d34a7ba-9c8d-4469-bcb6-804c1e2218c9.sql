ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS pricing_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing_addons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.product_pack_pricing_overrides
  ADD COLUMN IF NOT EXISTS pricing_addons jsonb;