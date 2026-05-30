-- Branch-level settings (mirrors tenant_settings shape, scoped to a branch).
-- Used initially for tax/VAT overrides per PostNet store.

CREATE TABLE public.branch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category text NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb,
  value_type text,
  is_sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, category, setting_key)
);

CREATE INDEX idx_branch_settings_branch_category
  ON public.branch_settings (branch_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_settings TO authenticated;
GRANT SELECT ON public.branch_settings TO anon;
GRANT ALL ON public.branch_settings TO service_role;

ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

-- Public read for non-sensitive settings (matches tenant_settings pattern so
-- the storefront can read e.g. tax config without auth).
CREATE POLICY "Public can read non-sensitive branch settings"
  ON public.branch_settings FOR SELECT
  USING (is_sensitive = false);

-- Tenant staff (any membership role for the tenant) can read everything,
-- including sensitive rows.
CREATE POLICY "Tenant members can read branch settings"
  ON public.branch_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
    )
  );

-- Only Owner/Admin (tenant or branch-scoped) can write.
CREATE POLICY "Admins can manage branch settings"
  ON public.branch_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
        AND m.role IN ('owner', 'admin')
        AND (m.branch_id IS NULL OR m.branch_id = branch_settings.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
        AND m.role IN ('owner', 'admin')
        AND (m.branch_id IS NULL OR m.branch_id = branch_settings.branch_id)
    )
  );

CREATE TRIGGER set_branch_settings_updated_at
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();