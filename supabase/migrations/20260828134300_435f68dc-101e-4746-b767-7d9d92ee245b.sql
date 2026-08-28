ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS is_watermark boolean NOT NULL DEFAULT false;