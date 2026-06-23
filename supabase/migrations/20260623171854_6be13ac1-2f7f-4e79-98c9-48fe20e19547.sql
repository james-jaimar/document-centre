
CREATE TABLE public.subscription_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  accepted_by uuid NOT NULL,
  document_slug text NOT NULL,
  document_version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  context text NOT NULL DEFAULT 'branch_checkout',
  stripe_checkout_session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_accept_branch ON public.subscription_acceptances(branch_id, document_slug, document_version);
CREATE INDEX idx_sub_accept_tenant ON public.subscription_acceptances(tenant_id);

GRANT SELECT ON public.subscription_acceptances TO authenticated;
GRANT ALL ON public.subscription_acceptances TO service_role;

ALTER TABLE public.subscription_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners/admins view acceptances"
  ON public.subscription_acceptances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = subscription_acceptances.tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner','admin')
    )
  );

CREATE POLICY "Branch managers view their branch acceptances"
  ON public.subscription_acceptances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = subscription_acceptances.tenant_id
        AND tm.branch_id = subscription_acceptances.branch_id
        AND tm.is_active = true
        AND tm.role = 'branch_manager'
    )
  );

CREATE POLICY "Platform admins view all acceptances"
  ON public.subscription_acceptances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'platform_admin'
    )
  );
