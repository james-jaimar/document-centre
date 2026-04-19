-- Customer CRM extensions
-- 1. Add metadata column to tenant_memberships for account-level customer settings
ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Customer addresses (persistent, not per-order)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text,
  address_type text NOT NULL DEFAULT 'delivery', -- 'delivery' | 'billing' | 'both'
  is_default boolean NOT NULL DEFAULT false,
  contact_name text,
  company_name text,
  phone text,
  email text,
  line1 text,
  line2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text DEFAULT 'South Africa',
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON public.customer_addresses(tenant_id, app_id, customer_profile_id);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Staff can manage all customer addresses in their tenant
CREATE POLICY "customer_addresses_staff_all"
  ON public.customer_addresses
  FOR ALL
  USING (public.user_is_staff_for(app_id, tenant_id))
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- Customers can view/manage their own addresses
CREATE POLICY "customer_addresses_owner_all"
  ON public.customer_addresses
  FOR ALL
  USING (customer_profile_id = auth.uid())
  WITH CHECK (customer_profile_id = auth.uid());

CREATE TRIGGER trg_customer_addresses_updated
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Customer tags (segmentation)
CREATE TABLE IF NOT EXISTS public.customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (tenant_id, app_id, customer_profile_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_customer
  ON public.customer_tags(tenant_id, app_id, customer_profile_id);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_tags_staff_all"
  ON public.customer_tags
  FOR ALL
  USING (public.user_is_staff_for(app_id, tenant_id))
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id));
