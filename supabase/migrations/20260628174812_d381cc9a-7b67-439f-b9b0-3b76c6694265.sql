
CREATE TABLE public.tenant_demo_gate (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  headline text NOT NULL DEFAULT 'Concept Demo',
  disclaimer_html text NOT NULL DEFAULT '',
  password_hash text,
  cookie_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_demo_gate TO authenticated;
GRANT ALL ON public.tenant_demo_gate TO service_role;

ALTER TABLE public.tenant_demo_gate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_gate_admin_select"
ON public.tenant_demo_gate FOR SELECT TO authenticated
USING (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "demo_gate_admin_insert"
ON public.tenant_demo_gate FOR INSERT TO authenticated
WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "demo_gate_admin_update"
ON public.tenant_demo_gate FOR UPDATE TO authenticated
USING (public.user_is_tenant_admin(tenant_id))
WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "demo_gate_admin_delete"
ON public.tenant_demo_gate FOR DELETE TO authenticated
USING (public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER update_tenant_demo_gate_updated_at
BEFORE UPDATE ON public.tenant_demo_gate
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public-safe view of the gate config (no hash).
CREATE OR REPLACE FUNCTION public.resolve_demo_gate(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE(enabled, false),
    'headline', COALESCE(headline, 'Concept Demo'),
    'disclaimer_html', COALESCE(disclaimer_html, ''),
    'cookie_days', COALESCE(cookie_days, 30)
  )
  FROM public.tenant_demo_gate
  WHERE tenant_id = p_tenant_id;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_demo_gate(uuid) TO anon, authenticated;
