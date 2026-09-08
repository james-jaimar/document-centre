ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS allow_per_page_artwork boolean NOT NULL DEFAULT false;