
-- 1. tenant_subscriptions table
CREATE TABLE public.tenant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  plan_slug text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'trialing',
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_ends_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Platform admins full access
CREATE POLICY "tenant_subscriptions_platform_admin_all"
  ON public.tenant_subscriptions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Tenant owner/admin can read own
CREATE POLICY "tenant_subscriptions_tenant_admin_select"
  ON public.tenant_subscriptions FOR SELECT
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

-- Updated_at trigger
CREATE TRIGGER set_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 2. Add plan_slug to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_slug text NOT NULL DEFAULT 'starter';

-- 3. Add stripe_price_id to platform_pricing_plans
ALTER TABLE public.platform_pricing_plans ADD COLUMN IF NOT EXISTS stripe_price_id text;
