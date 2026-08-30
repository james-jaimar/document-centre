ALTER TABLE public.artwork_template_placeholders
  DROP CONSTRAINT IF EXISTS artwork_template_placeholders_kind_check;

ALTER TABLE public.artwork_template_placeholders
  ADD CONSTRAINT artwork_template_placeholders_kind_check
  CHECK (kind = ANY (ARRAY['image'::text, 'text'::text, 'colour'::text]));

ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS default_cmyk jsonb,
  ADD COLUMN IF NOT EXISTS customer_editable_colour boolean NOT NULL DEFAULT true;