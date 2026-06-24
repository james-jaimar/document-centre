CREATE TABLE public.order_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  user_id uuid,
  terms_updated_at timestamptz,
  privacy_updated_at timestamptz,
  terms_snapshot_hash text,
  privacy_snapshot_hash text,
  ip_address text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_legal_acceptances TO authenticated;
GRANT ALL ON public.order_legal_acceptances TO service_role;

ALTER TABLE public.order_legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers view own acceptance"
ON public.order_legal_acceptances FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_legal_acceptances.order_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY "customers insert own acceptance"
ON public.order_legal_acceptances FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_legal_acceptances.order_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY "tenant staff view acceptances"
ON public.order_legal_acceptances FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.tenant_id = order_legal_acceptances.tenant_id
      AND p.id = auth.uid()
      AND m.is_active = true
  )
);

CREATE INDEX idx_order_legal_acceptances_order ON public.order_legal_acceptances(order_id);
CREATE INDEX idx_order_legal_acceptances_tenant ON public.order_legal_acceptances(tenant_id);
