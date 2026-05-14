
ALTER TABLE public.imposition_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'template_pdf',
  ADD COLUMN IF NOT EXISTS columns integer,
  ADD COLUMN IF NOT EXISTS rows integer,
  ADD COLUMN IF NOT EXISTS bleed_mm numeric(6,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS gutter_mm numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crop_mark_offset_mm numeric(6,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS crop_mark_length_mm numeric(6,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS show_registration boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS creep_per_sheet_mm numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_trim_inset_mm numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.imposition_templates
  ALTER COLUMN template_pdf_path DROP NOT NULL,
  ALTER COLUMN n_up DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imposition_templates_kind_check'
  ) THEN
    ALTER TABLE public.imposition_templates
      ADD CONSTRAINT imposition_templates_kind_check
      CHECK (kind IN ('template_pdf','parametric_nup','parametric_booklet'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imposition_templates_kind_fields_check'
  ) THEN
    ALTER TABLE public.imposition_templates
      ADD CONSTRAINT imposition_templates_kind_fields_check
      CHECK (
        (kind = 'template_pdf'      AND template_pdf_path IS NOT NULL AND n_up IS NOT NULL)
        OR (kind = 'parametric_nup' AND columns IS NOT NULL AND rows IS NOT NULL AND columns >= 1 AND rows >= 1)
        OR (kind = 'parametric_booklet')
      );
  END IF;
END $$;
