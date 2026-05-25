-- ============================================================
-- BRANCH IDENTITY + BANKING
-- ============================================================
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS accounts_email text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS banking_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.branches.banking_details IS
  'Per-branch banking & EFT details. Shape: { bank_name, account_name, account_number, branch_code, swift_code, eft_enabled (bool), payment_instructions }. Overrides tenant_settings payments.* when set.';

-- ============================================================
-- QUOTES RLS: branch-only roles limited to their own branch
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can_see_tenant_quote(p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT role, branch_id
    FROM public.tenant_memberships
    WHERE profile_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND is_active = true
  )
  SELECT
    -- Tenant-wide staff see everything
    EXISTS (
      SELECT 1 FROM m
      WHERE role IN ('owner','admin','sales','production','accounts')
    )
    -- Branch-only roles see only their own branch's quotes
    OR EXISTS (
      SELECT 1 FROM m
      WHERE role IN ('branch_manager','store_operator')
        AND branch_id IS NOT NULL
        AND branch_id = p_branch_id
    )
$$;

DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes
FOR SELECT
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_can_see_tenant_quote(tenant_id, branch_id)
  OR (
    customer_profile_id = auth.uid()
    AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id)
  )
);

DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_update ON public.quotes
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_can_see_tenant_quote(tenant_id, branch_id)
  OR (
    customer_profile_id = auth.uid()
    AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id)
  )
);

DROP POLICY IF EXISTS quotes_delete ON public.quotes;
CREATE POLICY quotes_delete ON public.quotes
FOR DELETE
USING (
  public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.user_can_see_tenant_quote(tenant_id, branch_id)
);