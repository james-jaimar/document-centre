
-- ============================================================
-- Phase 1: Enable RLS on internal processing tables
-- The pdf-server worker connects with the service role, which
-- bypasses RLS, so these locks do not affect the worker.
-- ============================================================

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_platform_admin_read"
  ON public.assets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

ALTER TABLE public.derived_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "derived_files_platform_admin_read"
  ON public.derived_files FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_platform_admin_read"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_events_platform_admin_read"
  ON public.job_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

ALTER TABLE public.ops_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_audit_log_platform_admin_all"
  ON public.ops_audit_log FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

ALTER TABLE public.ops_storage_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_storage_snapshots_platform_admin_read"
  ON public.ops_storage_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- ============================================================
-- Phase 2: Tighten anon-visible policies
-- ============================================================

-- branch_capabilities: scope anon read to current storefront tenant
DROP POLICY IF EXISTS branch_capabilities_public_read ON public.branch_capabilities;
CREATE POLICY "branch_capabilities_storefront_read"
  ON public.branch_capabilities FOR SELECT
  TO anon
  USING (
    is_enabled = true
    AND public.current_storefront_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_capabilities.branch_id
        AND b.tenant_id = public.current_storefront_tenant_id()
    )
  );

-- product_families: scope anon read to global rows OR current storefront tenant
DROP POLICY IF EXISTS product_families_public_read ON public.product_families;
CREATE POLICY "product_families_storefront_read"
  ON public.product_families FOR SELECT
  TO anon
  USING (
    is_active = true
    AND (
      tenant_id IS NULL
      OR tenant_id = public.current_storefront_tenant_id()
    )
  );

-- platform_promo_codes: remove broad authenticated read
DROP POLICY IF EXISTS promo_codes_authenticated_select ON public.platform_promo_codes;
