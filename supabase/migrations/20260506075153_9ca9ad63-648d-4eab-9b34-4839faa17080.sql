
-- ============================================================
-- customer_credit_accounts: branch-scoped credit facilities
-- ============================================================

CREATE TABLE public.customer_credit_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  app_id                uuid NOT NULL,
  branch_id             uuid,              -- NULL = tenant-wide default
  customer_profile_id   uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  credit_limit          numeric(12,2),
  payment_terms_days    integer,
  default_discount_pct  numeric(5,2),
  account_ref           text,              -- external legacy billing reference
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, customer_profile_id)
);

-- Handle NULL branch_id uniqueness (unique constraint treats NULLs as distinct)
CREATE UNIQUE INDEX uq_credit_account_tenant_default
  ON public.customer_credit_accounts (tenant_id, customer_profile_id)
  WHERE branch_id IS NULL;

ALTER TABLE public.customer_credit_accounts ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE TRIGGER set_credit_accounts_updated_at
  BEFORE UPDATE ON public.customer_credit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- RLS Policies ----

-- Staff (owner/admin/sales/accounts) can fully manage credit accounts for their tenant
CREATE POLICY "credit_accounts_staff_all"
  ON public.customer_credit_accounts
  FOR ALL
  TO authenticated
  USING (public.user_is_staff_for(app_id, tenant_id))
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- Branch staff (via tenant_memberships with branch_id) can manage their branch rows
CREATE POLICY "credit_accounts_branch_staff"
  ON public.customer_credit_accounts
  FOR ALL
  TO authenticated
  USING (
    branch_id IS NOT NULL
    AND branch_id = public.user_branch_id()
  )
  WITH CHECK (
    branch_id IS NOT NULL
    AND branch_id = public.user_branch_id()
  );

-- Platform admins can manage everything
CREATE POLICY "credit_accounts_platform_admin"
  ON public.customer_credit_accounts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- Customers can read their own credit accounts
CREATE POLICY "credit_accounts_customer_read"
  ON public.customer_credit_accounts
  FOR SELECT
  TO authenticated
  USING (customer_profile_id = auth.uid());

-- ---- Data migration from metadata ----
INSERT INTO public.customer_credit_accounts (
  tenant_id, app_id, branch_id, customer_profile_id,
  is_active, credit_limit, payment_terms_days, default_discount_pct, notes
)
SELECT
  tm.tenant_id,
  tm.app_id,
  NULL,  -- tenant-wide default
  tm.profile_id,
  COALESCE((tm.metadata->>'is_account_customer')::boolean, false),
  (tm.metadata->>'credit_limit')::numeric(12,2),
  (tm.metadata->>'payment_terms_days')::integer,
  (tm.metadata->>'default_discount_pct')::numeric(5,2),
  tm.metadata->>'notes'
FROM public.tenant_memberships tm
WHERE tm.role = 'customer'
  AND tm.metadata IS NOT NULL
  AND tm.metadata != '{}'::jsonb
  AND (
    tm.metadata ? 'is_account_customer'
    OR tm.metadata ? 'credit_limit'
    OR tm.metadata ? 'payment_terms_days'
    OR tm.metadata ? 'default_discount_pct'
  )
ON CONFLICT DO NOTHING;
