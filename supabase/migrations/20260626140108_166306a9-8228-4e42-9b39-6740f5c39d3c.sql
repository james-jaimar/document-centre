ALTER TABLE public.platform_pricing_plans
  ADD COLUMN IF NOT EXISTS stripe_coupon_id text,
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id text;

COMMENT ON COLUMN public.platform_pricing_plans.stripe_coupon_id IS
  'Stripe Coupon ID (e.g. clEFP4tT) auto-attached at checkout for this plan. Source of truth lives in the Stripe dashboard.';
COMMENT ON COLUMN public.platform_pricing_plans.stripe_promotion_code_id IS
  'Optional Stripe Promotion Code ID wrapping the coupon, for customer-typeable codes.';

UPDATE public.platform_pricing_plans
   SET price = 749.00,
       stripe_coupon_id = 'clEFP4tT'
 WHERE id = '18d34bb6-bd28-4b98-883e-7d093c57d9db';