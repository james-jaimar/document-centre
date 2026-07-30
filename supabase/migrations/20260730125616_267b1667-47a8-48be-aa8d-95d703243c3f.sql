ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS imposed_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS imposition_templates_by_component jsonb NOT NULL DEFAULT '{}'::jsonb;