ALTER TABLE public.artwork_templates
  ADD COLUMN IF NOT EXISTS trim_offset_x_mm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trim_offset_y_mm numeric NOT NULL DEFAULT 0;