
-- 1. tenant_product_toggles: per-tenant on/off for master products
CREATE TABLE public.tenant_product_toggles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_family_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_family_id)
);
CREATE INDEX idx_tpt_tenant ON public.tenant_product_toggles(tenant_id);
CREATE INDEX idx_tpt_family ON public.tenant_product_toggles(product_family_id);

ALTER TABLE public.tenant_product_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpt_platform_admin_all ON public.tenant_product_toggles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY tpt_tenant_admin_all ON public.tenant_product_toggles
  FOR ALL TO authenticated
  USING (user_is_tenant_admin(tenant_id))
  WITH CHECK (user_is_tenant_admin(tenant_id));

CREATE POLICY tpt_tenant_member_read ON public.tenant_product_toggles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = tenant_product_toggles.tenant_id
      AND tm.is_active = true
  ));

CREATE POLICY tpt_public_read ON public.tenant_product_toggles
  FOR SELECT TO anon
  USING (true);

CREATE TRIGGER trg_tpt_updated_at
  BEFORE UPDATE ON public.tenant_product_toggles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. branch_id on product_price_overrides for branch-level overrides
ALTER TABLE public.product_price_overrides
  ADD COLUMN branch_id uuid NULL;
CREATE INDEX idx_ppo_branch ON public.product_price_overrides(branch_id);

-- Branch staff (owner/admin/branch_manager) can manage overrides for their branch
CREATE POLICY ppo_branch_staff_all ON public.product_price_overrides
  FOR ALL TO authenticated
  USING (
    branch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id = product_price_overrides.tenant_id
        AND (
          tm.branch_id = product_price_overrides.branch_id
          OR tm.role IN ('owner','admin')
        )
    )
  )
  WITH CHECK (
    branch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id = product_price_overrides.tenant_id
        AND (
          tm.branch_id = product_price_overrides.branch_id
          OR tm.role IN ('owner','admin')
        )
    )
  );

-- Public read of active overrides (for storefront pricing)
CREATE POLICY ppo_public_read ON public.product_price_overrides
  FOR SELECT TO anon
  USING (is_active = true);

-- 3. Tighten master tables: prevent tenant/head-office from writing tenant-scoped rows.
-- Master catalogue is platform-admin authoritative.
DROP POLICY IF EXISTS "Head office admins can manage tenant products" ON public.product_families;
DROP POLICY IF EXISTS "Head office admins can manage tenant options" ON public.product_options;
DROP POLICY IF EXISTS "Head office admins can manage tenant pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "Tenant admins can manage tenant pricing" ON public.pricing_rules;
