CREATE TABLE public.artwork_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type rate_card_scope NOT NULL DEFAULT 'tenant',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  product_family_id uuid REFERENCES public.product_families(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_pdf_path text,
  preview_path text,
  page_count integer NOT NULL DEFAULT 12,
  trim_width_mm numeric NOT NULL DEFAULT 594,
  trim_height_mm numeric NOT NULL DEFAULT 420,
  bleed_mm numeric NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artwork_templates_family_idx ON public.artwork_templates (product_family_id);
CREATE INDEX artwork_templates_tenant_idx ON public.artwork_templates (tenant_id);

GRANT SELECT ON public.artwork_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_templates TO authenticated;
GRANT ALL ON public.artwork_templates TO service_role;

ALTER TABLE public.artwork_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY artwork_templates_read ON public.artwork_templates
FOR SELECT
USING (
  is_active = true
  AND (
    (status = 'published' AND scope_type = 'master')
    OR (
      status = 'published'
      AND tenant_id IS NOT NULL
      AND current_storefront_tenant_id() IS NOT NULL
      AND tenant_id = current_storefront_tenant_id()
    )
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR (tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
    OR (tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = artwork_templates.tenant_id
        AND tm.is_active = true
    ))
  )
);

CREATE POLICY artwork_templates_master_write ON public.artwork_templates
FOR ALL
USING (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY artwork_templates_tenant_write ON public.artwork_templates
FOR ALL
USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id));

CREATE POLICY artwork_templates_branch_write ON public.artwork_templates
FOR ALL
USING (
  scope_type = 'branch' AND branch_id IS NOT NULL AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid() AND tm.is_active = true
        AND tm.branch_id = artwork_templates.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
)
WITH CHECK (
  scope_type = 'branch' AND branch_id IS NOT NULL AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid() AND tm.is_active = true
        AND tm.branch_id = artwork_templates.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
);

CREATE TRIGGER trg_artwork_templates_updated_at BEFORE UPDATE ON public.artwork_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.artwork_template_placeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.artwork_templates(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image','text')),
  name text NOT NULL,
  x_mm numeric NOT NULL DEFAULT 0,
  y_mm numeric NOT NULL DEFAULT 0,
  width_mm numeric NOT NULL DEFAULT 50,
  height_mm numeric NOT NULL DEFAULT 50,
  fit_mode text NOT NULL DEFAULT 'fill' CHECK (fit_mode IN ('fit','fill')),
  corner_radius_mm numeric NOT NULL DEFAULT 0,
  background_hex text,
  text_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_length integer,
  default_value text,
  is_required boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artwork_template_placeholders_template_idx ON public.artwork_template_placeholders (template_id);

GRANT SELECT ON public.artwork_template_placeholders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_template_placeholders TO authenticated;
GRANT ALL ON public.artwork_template_placeholders TO service_role;

ALTER TABLE public.artwork_template_placeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY artwork_placeholders_read ON public.artwork_template_placeholders
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.artwork_templates t WHERE t.id = artwork_template_placeholders.template_id
));

CREATE POLICY artwork_placeholders_write ON public.artwork_template_placeholders
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.artwork_templates t
  WHERE t.id = artwork_template_placeholders.template_id
    AND (
      (t.scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role))
      OR (t.tenant_id IS NOT NULL AND user_is_tenant_admin(t.tenant_id))
      OR (t.branch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.profile_id = auth.uid() AND tm.is_active = true
          AND tm.branch_id = t.branch_id
          AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
      ))
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.artwork_templates t
  WHERE t.id = artwork_template_placeholders.template_id
    AND (
      (t.scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role))
      OR (t.tenant_id IS NOT NULL AND user_is_tenant_admin(t.tenant_id))
      OR (t.branch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.profile_id = auth.uid() AND tm.is_active = true
          AND tm.branch_id = t.branch_id
          AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
      ))
    )
));

CREATE TRIGGER trg_artwork_placeholders_updated_at BEFORE UPDATE ON public.artwork_template_placeholders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();