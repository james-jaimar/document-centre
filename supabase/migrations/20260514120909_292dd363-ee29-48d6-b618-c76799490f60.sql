-- Imposition templates (platform-owned library)
CREATE TABLE public.imposition_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  input_size TEXT NOT NULL,
  input_width_mm NUMERIC(8,2) NOT NULL,
  input_height_mm NUMERIC(8,2) NOT NULL,
  output_size TEXT NOT NULL,
  output_width_mm NUMERIC(8,2) NOT NULL,
  output_height_mm NUMERIC(8,2) NOT NULL,
  n_up INTEGER NOT NULL CHECK (n_up >= 1),
  has_bleed BOOLEAN NOT NULL DEFAULT false,
  has_crop_marks BOOLEAN NOT NULL DEFAULT false,
  work_style TEXT NOT NULL DEFAULT 'cut_sheet' CHECK (work_style IN ('cut_sheet','work_and_turn','sheetwise')),
  template_pdf_path TEXT,
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.imposition_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imposition_templates_read_authenticated"
  ON public.imposition_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "imposition_templates_platform_admin_write"
  ON public.imposition_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER trg_imposition_templates_updated_at
  BEFORE UPDATE ON public.imposition_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_imposition_templates_active ON public.imposition_templates(is_active, sort_order);

-- Per-product-family defaults
CREATE TABLE public.product_imposition_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_family_id UUID NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  imposition_template_id UUID NOT NULL REFERENCES public.imposition_templates(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_family_id, imposition_template_id)
);

CREATE UNIQUE INDEX idx_product_imposition_defaults_one_primary
  ON public.product_imposition_defaults(product_family_id)
  WHERE is_primary = true;

ALTER TABLE public.product_imposition_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pid_read_authenticated"
  ON public.product_imposition_defaults FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pid_platform_admin_write"
  ON public.product_imposition_defaults FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE TRIGGER trg_pid_updated_at
  BEFORE UPDATE ON public.product_imposition_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- order_jobs additions
ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS imposition_template_id UUID REFERENCES public.imposition_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imposition_n_up INTEGER;

-- Storage bucket for template PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('imposition-templates', 'imposition-templates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "imposition_templates_bucket_admin_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'imposition-templates' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "imposition_templates_bucket_admin_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'imposition-templates' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "imposition_templates_bucket_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'imposition-templates' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "imposition_templates_bucket_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'imposition-templates' AND public.has_role(auth.uid(), 'platform_admin'::app_role));