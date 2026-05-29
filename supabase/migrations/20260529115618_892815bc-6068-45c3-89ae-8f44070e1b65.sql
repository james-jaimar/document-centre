
-- 1. Add scope column to platform_pricing_plans
ALTER TABLE public.platform_pricing_plans
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'tenant'
  CHECK (scope IN ('tenant','branch'));

-- 2. Helper: can the caller read a branch's subscription?
CREATE OR REPLACE FUNCTION public.user_can_read_branch_subscription(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id AND public.user_is_tenant_admin(b.tenant_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = p_branch_id
        AND tm.role IN ('branch_manager','store_operator','sales','production','accounts')
    )
  );
$$;

-- 3. Helper: can the caller write/assign a branch's subscription?
CREATE OR REPLACE FUNCTION public.user_can_write_branch_subscription(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id AND public.user_is_tenant_admin(b.tenant_id)
    )
  );
$$;

-- 4. branch_subscriptions table
CREATE TABLE IF NOT EXISTS public.branch_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  region_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_slug text,
  status text,
  billing_status text DEFAULT 'pending_payment',
  assigned_plan_slug text,
  assigned_at timestamptz,
  assigned_by uuid,
  promo_code_id uuid,
  discount_type text,
  discount_value numeric,
  trial_days integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_subs_tenant ON public.branch_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_subs_stripe_sub ON public.branch_subscriptions(stripe_subscription_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_subscriptions TO authenticated;
GRANT ALL ON public.branch_subscriptions TO service_role;

ALTER TABLE public.branch_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bs_select" ON public.branch_subscriptions
  FOR SELECT TO authenticated
  USING (public.user_can_read_branch_subscription(branch_id));

CREATE POLICY "bs_insert" ON public.branch_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_write_branch_subscription(branch_id));

CREATE POLICY "bs_update" ON public.branch_subscriptions
  FOR UPDATE TO authenticated
  USING (public.user_can_write_branch_subscription(branch_id))
  WITH CHECK (public.user_can_write_branch_subscription(branch_id));

CREATE POLICY "bs_delete" ON public.branch_subscriptions
  FOR DELETE TO authenticated
  USING (public.user_can_write_branch_subscription(branch_id));

CREATE TRIGGER set_branch_subscriptions_updated_at
  BEFORE UPDATE ON public.branch_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
