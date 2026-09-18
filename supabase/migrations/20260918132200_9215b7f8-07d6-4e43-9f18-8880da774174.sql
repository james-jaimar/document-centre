ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS max_trim_width_mm numeric,
  ADD COLUMN IF NOT EXISTS max_trim_height_mm numeric;

UPDATE public.product_families
SET max_trim_width_mm = 260, max_trim_height_mm = 400
WHERE slug = 'a4tentcalendar';