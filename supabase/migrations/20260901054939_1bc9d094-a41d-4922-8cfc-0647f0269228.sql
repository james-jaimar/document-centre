ALTER TABLE public.artwork_template_placeholders
  ADD COLUMN IF NOT EXISTS page_indexes integer[],
  ADD COLUMN IF NOT EXISTS field_key text;

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.artwork_template_placeholders'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%page_scope%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.artwork_template_placeholders DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.artwork_template_placeholders
  ADD CONSTRAINT artwork_template_placeholders_page_scope_check
  CHECK (page_scope IN ('all','page','pages'));

CREATE INDEX IF NOT EXISTS artwork_template_placeholders_field_key_idx
  ON public.artwork_template_placeholders (template_id, field_key);