-- =========================================================================
-- Customer payment gateways: tenant + branch credentials, attempts audit
-- =========================================================================

-- ---- tenant_payment_gateways --------------------------------------------
CREATE TABLE public.tenant_payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe','payfast')),
  is_enabled boolean NOT NULL DEFAULT false,
  display_label text,
  credentials_secret_id uuid,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX idx_tenant_payment_gateways_tenant ON public.tenant_payment_gateways(tenant_id);

ALTER TABLE public.tenant_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tenant_payment_gateways_updated_at
BEFORE UPDATE ON public.tenant_payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Platform admin: full access
CREATE POLICY tpg_platform_admin_all ON public.tenant_payment_gateways
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Tenant owner/admin: read
CREATE POLICY tpg_tenant_admin_read ON public.tenant_payment_gateways
FOR SELECT TO authenticated
USING (public.user_is_tenant_admin(tenant_id));

-- Tenant owner/admin: update credentials/label/mode (NOT is_enabled)
-- We can't easily prevent a single column update via RLS; we enforce via
-- a BEFORE UPDATE trigger that resets is_enabled when actor isn't platform admin.
CREATE OR REPLACE FUNCTION public.tpg_protect_is_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_enabled IS DISTINCT FROM OLD.is_enabled
     AND NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    NEW.is_enabled := OLD.is_enabled;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tpg_protect_is_enabled
BEFORE UPDATE ON public.tenant_payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.tpg_protect_is_enabled();

CREATE POLICY tpg_tenant_admin_update ON public.tenant_payment_gateways
FOR UPDATE TO authenticated
USING (public.user_is_tenant_admin(tenant_id))
WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- ---- branch_payment_gateways --------------------------------------------
CREATE TABLE public.branch_payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe','payfast')),
  credentials_secret_id uuid,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, provider)
);

CREATE INDEX idx_branch_payment_gateways_branch ON public.branch_payment_gateways(branch_id);

ALTER TABLE public.branch_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_branch_payment_gateways_updated_at
BEFORE UPDATE ON public.branch_payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY bpg_platform_admin_all ON public.branch_payment_gateways
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY bpg_tenant_admin_all ON public.branch_payment_gateways
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = branch_payment_gateways.branch_id
      AND public.user_is_tenant_admin(b.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = branch_payment_gateways.branch_id
      AND public.user_is_tenant_admin(b.tenant_id)
  )
);

-- ---- order_payment_attempts ---------------------------------------------
CREATE TABLE public.order_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  app_id uuid NOT NULL,
  branch_id uuid,
  provider text NOT NULL CHECK (provider IN ('stripe','payfast')),
  provider_session_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled')),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opa_order ON public.order_payment_attempts(order_id);
CREATE INDEX idx_opa_session ON public.order_payment_attempts(provider, provider_session_id);

ALTER TABLE public.order_payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_opa_updated_at
BEFORE UPDATE ON public.order_payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY opa_select_policy ON public.order_payment_attempts
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_is_staff_for(app_id, tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_payment_attempts.order_id
      AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);

-- No client INSERT/UPDATE/DELETE policies — edge functions use service role.

-- ---- Vault helpers for payment secrets ----------------------------------
CREATE OR REPLACE FUNCTION public.create_payment_secret(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := vault.create_secret(p_secret, p_name);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_payment_secret(p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_payment_secret(p_secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.read_payment_secret(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_payment_secret(text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_payment_secret(uuid) FROM public, anon, authenticated;