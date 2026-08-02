ALTER TABLE public.platform_pricing_regions
  ADD COLUMN IF NOT EXISTS is_rest_of_world boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS platform_pricing_regions_one_rest_of_world
  ON public.platform_pricing_regions ((is_rest_of_world))
  WHERE is_rest_of_world;