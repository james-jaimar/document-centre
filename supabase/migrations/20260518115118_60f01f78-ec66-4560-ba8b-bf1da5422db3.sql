
-- =====================================================
-- Phase 4a: tenants column-level restriction for anon
-- =====================================================
-- Strip blanket SELECT on the whole table from anon, then grant only the
-- columns the public storefront genuinely needs. Authenticated members keep
-- full access through the membership-scoped RLS policy.
REVOKE SELECT ON public.tenants FROM anon;
GRANT  SELECT (id, slug, name, app_id, logo_url, custom_domain, is_demo, is_active)
       ON public.tenants TO anon;

-- =====================================================
-- Phase 4b: SECURITY DEFINER function audit
-- =====================================================
-- (a) Mutations that must only run inside edge functions (service role)
REVOKE EXECUTE ON FUNCTION public.generate_order_number(uuid)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid, uuid)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_invoice_number(uuid, uuid)          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_number(uuid, text)                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollup_order_status(uuid)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_amounts(uuid)                  FROM anon, authenticated;

-- (b) Admin-only functions still callable from authenticated tenant-admin UIs,
--     but never from anon. They already self-check role internally.
REVOKE EXECUTE ON FUNCTION public.regenerate_pricing_rules_for_currency(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clone_master_rate_card_to_tenant(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_branch_capabilities(uuid)              FROM anon;
