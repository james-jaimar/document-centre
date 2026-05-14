
-- ============================================================================
-- Storefront tenant guard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_storefront_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    ((current_setting('request.headers', true))::json ->> 'x-storefront-tenant'),
    ''
  )::uuid
$$;

-- ============================================================================
-- branches
-- ============================================================================
DROP POLICY IF EXISTS "branches_public_read" ON public.branches;

CREATE POLICY "branches_storefront_or_member_read"
ON public.branches
FOR SELECT
USING (
  is_active = true
  AND (
    -- Storefront mode: only the URL-resolved tenant
    (public.current_storefront_tenant_id() IS NOT NULL
       AND tenant_id = public.current_storefront_tenant_id())
    -- Admin/platform mode: any active branch in tenants caller belongs to
    OR (public.current_storefront_tenant_id() IS NULL
       AND EXISTS (
         SELECT 1 FROM public.tenant_memberships tm
         WHERE tm.profile_id = auth.uid()
           AND tm.tenant_id = branches.tenant_id
           AND tm.is_active = true
       ))
    OR (public.current_storefront_tenant_id() IS NULL
       AND public.has_role(auth.uid(), 'platform_admin'::app_role))
  )
);

-- ============================================================================
-- pricing_rules
-- ============================================================================
DROP POLICY IF EXISTS "pricing_rules_public_read" ON public.pricing_rules;
DROP POLICY IF EXISTS "Users can view active pricing" ON public.pricing_rules;

CREATE POLICY "pricing_rules_storefront_read"
ON public.pricing_rules
FOR SELECT
USING (
  is_active = true
  AND (
    tenant_id IS NULL  -- master pricing always visible
    OR (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.tenant_id = pricing_rules.tenant_id
              AND tm.is_active = true
          )
          OR public.has_role(auth.uid(), 'platform_admin'::app_role)
        ))
  )
);

-- ============================================================================
-- product_options
-- ============================================================================
DROP POLICY IF EXISTS "product_options_public_read" ON public.product_options;
DROP POLICY IF EXISTS "Users can view product options" ON public.product_options;

CREATE POLICY "product_options_storefront_read"
ON public.product_options
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.product_families pf
    WHERE pf.id = product_options.product_family_id
      AND pf.is_active = true
      AND (
        pf.tenant_id IS NULL
        OR (public.current_storefront_tenant_id() IS NOT NULL
            AND pf.tenant_id = public.current_storefront_tenant_id())
        OR (public.current_storefront_tenant_id() IS NULL
            AND (
              EXISTS (
                SELECT 1 FROM public.tenant_memberships tm
                WHERE tm.profile_id = auth.uid()
                  AND tm.tenant_id = pf.tenant_id
                  AND tm.is_active = true
              )
              OR public.has_role(auth.uid(), 'platform_admin'::app_role)
            ))
      )
  )
);

-- ============================================================================
-- product_price_overrides
-- ============================================================================
DROP POLICY IF EXISTS "ppo_public_read" ON public.product_price_overrides;

CREATE POLICY "ppo_storefront_or_member_read"
ON public.product_price_overrides
FOR SELECT
USING (
  is_active = true
  AND (
    (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.tenant_id = product_price_overrides.tenant_id
              AND tm.is_active = true
          )
          OR public.has_role(auth.uid(), 'platform_admin'::app_role)
        ))
  )
);

-- ============================================================================
-- tenant_payment_gateways — allow customers to see enabled gateways for
-- the storefront tenant they are checking out on (anon + auth).
-- ============================================================================
CREATE POLICY "tpg_storefront_read_enabled"
ON public.tenant_payment_gateways
FOR SELECT
USING (
  is_enabled = true
  AND public.current_storefront_tenant_id() IS NOT NULL
  AND tenant_id = public.current_storefront_tenant_id()
);

-- ============================================================================
-- rate_card_* — replace wide reads with storefront-scoped reads,
-- keep master rows visible everywhere.
-- ============================================================================
DROP POLICY IF EXISTS "rcc_read_all" ON public.rate_card_clicks;
CREATE POLICY "rcc_storefront_or_member_read"
ON public.rate_card_clicks
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'::rate_card_scope
    OR (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND tenant_id IS NOT NULL
        AND public.user_is_tenant_admin(tenant_id))
  )
);

DROP POLICY IF EXISTS "rcp_read_all" ON public.rate_card_papers;
CREATE POLICY "rcp_storefront_or_member_read"
ON public.rate_card_papers
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'::rate_card_scope
    OR (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND tenant_id IS NOT NULL
        AND public.user_is_tenant_admin(tenant_id))
  )
);

DROP POLICY IF EXISTS "rcf_read_all" ON public.rate_card_finishing;
CREATE POLICY "rcf_storefront_or_member_read"
ON public.rate_card_finishing
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'::rate_card_scope
    OR (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND tenant_id IS NOT NULL
        AND public.user_is_tenant_admin(tenant_id))
  )
);

DROP POLICY IF EXISTS "rcpp_read_all" ON public.rate_card_photo_prints;
CREATE POLICY "rcpp_storefront_or_member_read"
ON public.rate_card_photo_prints
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'::rate_card_scope
    OR (public.current_storefront_tenant_id() IS NOT NULL
        AND tenant_id = public.current_storefront_tenant_id())
    OR (public.current_storefront_tenant_id() IS NULL
        AND tenant_id IS NOT NULL
        AND public.user_is_tenant_admin(tenant_id))
  )
);
