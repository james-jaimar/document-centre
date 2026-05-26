
CREATE TABLE public.branch_product_option_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value_slug text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_option_id, value_slug)
);

CREATE INDEX idx_bpoo_branch ON public.branch_product_option_overrides(branch_id);
CREATE INDEX idx_bpoo_option ON public.branch_product_option_overrides(product_option_id);

GRANT SELECT ON public.branch_product_option_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branch_product_option_overrides TO authenticated;
GRANT ALL ON public.branch_product_option_overrides TO service_role;

ALTER TABLE public.branch_product_option_overrides ENABLE ROW LEVEL SECURITY;

-- Public read (storefront needs to know what to hide)
CREATE POLICY "Anyone can read branch option overrides"
  ON public.branch_product_option_overrides
  FOR SELECT
  USING (true);

-- Branch staff or tenant admin can manage
CREATE POLICY "Branch staff can insert overrides"
  ON public.branch_product_option_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.tenant_memberships tm ON tm.tenant_id = b.tenant_id
      WHERE b.id = branch_product_option_overrides.branch_id
        AND tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND (
          tm.role IN ('owner','admin')
          OR (tm.role IN ('branch_manager','store_operator') AND tm.branch_id = b.id)
        )
    )
  );

CREATE POLICY "Branch staff can update overrides"
  ON public.branch_product_option_overrides
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.tenant_memberships tm ON tm.tenant_id = b.tenant_id
      WHERE b.id = branch_product_option_overrides.branch_id
        AND tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND (
          tm.role IN ('owner','admin')
          OR (tm.role IN ('branch_manager','store_operator') AND tm.branch_id = b.id)
        )
    )
  );

CREATE POLICY "Branch staff can delete overrides"
  ON public.branch_product_option_overrides
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.tenant_memberships tm ON tm.tenant_id = b.tenant_id
      WHERE b.id = branch_product_option_overrides.branch_id
        AND tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND (
          tm.role IN ('owner','admin')
          OR (tm.role IN ('branch_manager','store_operator') AND tm.branch_id = b.id)
        )
    )
  );

CREATE TRIGGER trg_bpoo_updated_at
  BEFORE UPDATE ON public.branch_product_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
