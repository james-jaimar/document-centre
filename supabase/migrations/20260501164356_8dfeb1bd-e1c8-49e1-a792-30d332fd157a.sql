-- 1. Create platform_promo_codes table
CREATE TABLE public.platform_promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  currency_code text,
  max_uses integer,
  times_used integer NOT NULL DEFAULT 0,
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  applicable_plan_slugs text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_promo_codes_code_unique UNIQUE (code),
  CONSTRAINT platform_promo_codes_discount_type_check CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_months'))
);

ALTER TABLE public.platform_promo_codes ENABLE ROW LEVEL SECURITY;

-- Platform admins full access
CREATE POLICY "promo_codes_platform_admin_all"
  ON public.platform_promo_codes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Authenticated users can read active promo codes (for validation)
CREATE POLICY "promo_codes_authenticated_select"
  ON public.platform_promo_codes FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Updated_at trigger
CREATE TRIGGER set_promo_codes_updated_at
  BEFORE UPDATE ON public.platform_promo_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 2. Extend tenant_subscriptions with new columns
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.platform_pricing_regions(id),
  ADD COLUMN IF NOT EXISTS assigned_plan_slug text,
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.platform_promo_codes(id),
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT 0;

-- Make stripe_customer_id nullable (admin-assigned subs won't have one yet)
ALTER TABLE public.tenant_subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;