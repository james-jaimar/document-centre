ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS page_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS page_index integer;

ALTER TABLE public.artwork_template_placeholders
  DROP CONSTRAINT IF EXISTS artwork_template_placeholders_page_scope_check;
ALTER TABLE public.artwork_template_placeholders
  ADD CONSTRAINT artwork_template_placeholders_page_scope_check
  CHECK (page_scope IN ('all','page'));

CREATE INDEX IF NOT EXISTS artwork_template_placeholders_page_idx
  ON public.artwork_template_placeholders (template_id, page_index);