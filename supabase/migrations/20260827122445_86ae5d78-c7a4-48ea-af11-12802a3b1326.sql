ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS supplied_artwork_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_page_count integer,
  ADD COLUMN IF NOT EXISTS expected_trim_width_mm numeric,
  ADD COLUMN IF NOT EXISTS expected_trim_height_mm numeric;