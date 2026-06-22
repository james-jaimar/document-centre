
-- =========================================================================
-- Phase 1: Restrict anonymous SELECT on `public.tenants` to safe columns only
-- =========================================================================
-- Drop the blanket public-read policy and replace with one scoped to the
-- columns anon legitimately needs. Sensitive financial/legal columns
-- (vat_number, registration_number, billing_email, billing_notes,
--  assigned_discount_*, assigned_trial_days, plan_assigned_*, settings,
--  legal_name, external_ref, payment_mode, proof_mode, workflow_template,
--  onboarding_status, plan_slug, assigned_plan_slug, assigned_region_id)
-- become invisible to anon at the GRANT layer.

REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  logo_url,
  app_id,
  is_active,
  is_demo,
  custom_domain,
  trading_name,
  website_url,
  support_email,
  support_phone,
  default_currency,
  country,
  timezone,
  locale,
  created_at,
  updated_at
) ON public.tenants TO anon;

-- The anon SELECT policy can stay (USING is_active=true) because column-level
-- GRANTs are the second gate. authenticated members keep full row access via
-- existing `tenants_select_membership` policy.

-- =========================================================================
-- Phase 2: Revoke `cost_price` SELECT from anon on pricing tables
-- =========================================================================
-- cost_price is internal margin data. Storefront/customer reads only need
-- sell_price. Admin pricing editors run as `authenticated` and keep access.

REVOKE SELECT (cost_price) ON public.rate_card_business_cards FROM anon;
REVOKE SELECT (cost_price) ON public.rate_card_photo_prints   FROM anon;
REVOKE SELECT (cost_price) ON public.rate_card_price_breaks   FROM anon;
REVOKE SELECT (cost_price) ON public.rate_card_clicks         FROM anon;
REVOKE SELECT (cost_price) ON public.product_price_overrides  FROM anon;
