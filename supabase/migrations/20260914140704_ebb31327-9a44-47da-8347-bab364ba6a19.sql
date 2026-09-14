CREATE OR REPLACE VIEW public.tenants_public AS
SELECT
  t.id,
  t.app_id,
  t.name,
  t.trading_name,
  t.slug,
  t.logo_url,
  t.custom_domain,
  t.website_url,
  t.is_demo,
  t.is_active,
  t.country,
  t.country_code,
  t.show_country_selector,
  t.default_currency,
  t.timezone,
  t.locale
FROM public.tenants t
WHERE t.is_active = true;

ALTER VIEW public.tenants_public SET (security_barrier = true);

GRANT SELECT ON public.tenants_public TO anon;
GRANT SELECT ON public.tenants_public TO authenticated;
GRANT SELECT ON public.tenants_public TO service_role;

DROP POLICY IF EXISTS "tenants_public_read_active" ON public.tenants;
DROP POLICY IF EXISTS "tenants_public_read_active_auth" ON public.tenants;