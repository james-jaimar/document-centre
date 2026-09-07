CREATE TABLE public.customer_account_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  app_id uuid NOT NULL,
  branch_id uuid,
  company_id uuid REFERENCES public.customer_companies(id) ON DELETE CASCADE,
  customer_profile_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN ('charge','payment','credit_note','opening_balance')),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference text,
  note text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_target_present CHECK (company_id IS NOT NULL OR customer_profile_id IS NOT NULL)
);

CREATE INDEX idx_account_ledger_company ON public.customer_account_ledger (tenant_id, company_id, entry_date);
CREATE INDEX idx_account_ledger_profile ON public.customer_account_ledger (tenant_id, customer_profile_id, entry_date);
CREATE UNIQUE INDEX uq_account_ledger_order_charge
  ON public.customer_account_ledger (order_id)
  WHERE entry_type = 'charge' AND order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_account_ledger TO authenticated;
GRANT ALL ON public.customer_account_ledger TO service_role;

ALTER TABLE public.customer_account_ledger ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_account_ledger_updated_at
  BEFORE UPDATE ON public.customer_account_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY account_ledger_staff_all ON public.customer_account_ledger
  FOR ALL TO authenticated
  USING (public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

CREATE POLICY account_ledger_tenant_staff ON public.customer_account_ledger
  FOR ALL TO authenticated
  USING (public.user_is_staff_for(app_id, tenant_id))
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

CREATE POLICY account_ledger_platform_admin ON public.customer_account_ledger
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY account_ledger_customer_read ON public.customer_account_ledger
  FOR SELECT TO authenticated
  USING (
    customer_profile_id = auth.uid()
    OR (
      company_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.profile_id = auth.uid()
          AND tm.company_id = customer_account_ledger.company_id
          AND tm.is_active
      )
    )
  );

CREATE OR REPLACE FUNCTION public.resolve_account_balance(
  p_tenant_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT amount, entry_type, due_date
    FROM public.customer_account_ledger l
    WHERE l.tenant_id = p_tenant_id
      AND (
        (p_company_id IS NOT NULL AND l.company_id = p_company_id)
        OR (p_company_id IS NULL AND p_profile_id IS NOT NULL AND l.customer_profile_id = p_profile_id)
      )
  )
  SELECT jsonb_build_object(
    'balance', COALESCE(SUM(amount), 0),
    'overdue', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'charge' AND due_date IS NOT NULL AND due_date < CURRENT_DATE), 0),
    'bucket_current', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'charge' AND (due_date IS NULL OR due_date >= CURRENT_DATE)), 0),
    'bucket_30', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'charge' AND due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1), 0),
    'bucket_60', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'charge' AND due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31), 0),
    'bucket_90', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'charge' AND due_date < CURRENT_DATE - 60), 0)
  )
  FROM rows;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_account_balance(uuid, uuid, uuid) TO authenticated, anon, service_role;