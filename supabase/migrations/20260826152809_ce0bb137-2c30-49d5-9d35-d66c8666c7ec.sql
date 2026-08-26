ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'over',
  ADD COLUMN IF NOT EXISTS z_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opacity numeric NOT NULL DEFAULT 1;

ALTER TABLE public.artwork_template_placeholders
  DROP CONSTRAINT IF EXISTS artwork_template_placeholders_layer_check;
ALTER TABLE public.artwork_template_placeholders
  ADD CONSTRAINT artwork_template_placeholders_layer_check CHECK (layer IN ('under','over'));

ALTER TABLE public.artwork_template_placeholders
  DROP CONSTRAINT IF EXISTS artwork_template_placeholders_opacity_check;
ALTER TABLE public.artwork_template_placeholders
  ADD CONSTRAINT artwork_template_placeholders_opacity_check CHECK (opacity >= 0 AND opacity <= 1);

ALTER TABLE public.artwork_templates
  ADD COLUMN IF NOT EXISTS base_knockout_white boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_knockout_tolerance integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS base_transparent_path text;