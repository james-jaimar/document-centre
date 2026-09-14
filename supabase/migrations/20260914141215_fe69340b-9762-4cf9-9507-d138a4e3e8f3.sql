DROP VIEW IF EXISTS public.tenants_public;

CREATE OR REPLACE FUNCTION public.tenant_public_by_slug(p_slug text)
RETURNS TABLE (
  id uuid, app_id uuid, name text, trading_name text, slug text,
  logo_url text, custom_domain text, website_url text, is_demo boolean,
  country text, country_code character, show_country_selector boolean,
  default_currency text, timezone text, locale text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.app_id, t.name, t.trading_name, t.slug,
         t.logo_url, t.custom_domain, t.website_url, t.is_demo,
         t.country, t.country_code, t.show_country_selector,
         t.default_currency, t.timezone, t.locale
  FROM public.tenants t
  WHERE t.is_active = true AND t.slug = p_slug
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.tenant_public_by_id(p_id uuid)
RETURNS TABLE (
  id uuid, app_id uuid, name text, trading_name text, slug text,
  logo_url text, custom_domain text, website_url text, is_demo boolean,
  country text, country_code character, show_country_selector boolean,
  default_currency text, timezone text, locale text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.app_id, t.name, t.trading_name, t.slug,
         t.logo_url, t.custom_domain, t.website_url, t.is_demo,
         t.country, t.country_code, t.show_country_selector,
         t.default_currency, t.timezone, t.locale
  FROM public.tenants t
  WHERE t.is_active = true AND t.id = p_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.tenant_public_by_domain(p_domains text[])
RETURNS TABLE (
  id uuid, app_id uuid, name text, trading_name text, slug text,
  logo_url text, custom_domain text, website_url text, is_demo boolean,
  country text, country_code character, show_country_selector boolean,
  default_currency text, timezone text, locale text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.app_id, t.name, t.trading_name, t.slug,
         t.logo_url, t.custom_domain, t.website_url, t.is_demo,
         t.country, t.country_code, t.show_country_selector,
         t.default_currency, t.timezone, t.locale
  FROM public.tenants t
  WHERE t.is_active = true AND t.custom_domain = ANY(p_domains)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.tenant_public_by_slug(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_public_by_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_public_by_domain(text[]) TO anon, authenticated, service_role;