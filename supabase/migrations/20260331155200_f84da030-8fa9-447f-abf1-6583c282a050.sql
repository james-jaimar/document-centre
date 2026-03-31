
-- ============================================================
-- 1. Extend tenants table with new columns
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'ZA',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-ZA',
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'prepaid',
  ADD COLUMN IF NOT EXISTS proof_mode text NOT NULL DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS workflow_template text NOT NULL DEFAULT 'prepaid_no_proof';

-- ============================================================
-- 2. Create tenant_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  value_type text NOT NULL DEFAULT 'string',
  is_sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, category, setting_key)
);

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger
CREATE TRIGGER set_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. RLS policies for tenant_settings
-- ============================================================

-- Platform admins: full access
CREATE POLICY "tenant_settings_all_platform_admin"
ON public.tenant_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- Tenant owner/admin: select
CREATE POLICY "tenant_settings_select_tenant_admin"
ON public.tenant_settings FOR SELECT TO authenticated
USING (public.user_is_tenant_admin(tenant_id));

-- Tenant owner/admin: insert
CREATE POLICY "tenant_settings_insert_tenant_admin"
ON public.tenant_settings FOR INSERT TO authenticated
WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- Tenant owner/admin: update
CREATE POLICY "tenant_settings_update_tenant_admin"
ON public.tenant_settings FOR UPDATE TO authenticated
USING (public.user_is_tenant_admin(tenant_id))
WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- Tenant owner/admin: delete
CREATE POLICY "tenant_settings_delete_tenant_admin"
ON public.tenant_settings FOR DELETE TO authenticated
USING (public.user_is_tenant_admin(tenant_id));

-- ============================================================
-- 4. resolve_tenant_setting function (inheritance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_tenant_setting(
  p_tenant_id uuid,
  p_category text,
  p_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT setting_value FROM public.tenant_settings
     WHERE tenant_id = p_tenant_id AND category = p_category AND setting_key = p_key),
    (SELECT setting_value FROM public.tenant_settings
     WHERE tenant_id IS NULL AND category = p_category AND setting_key = p_key),
    'null'::jsonb
  );
$$;
