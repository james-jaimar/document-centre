CREATE TABLE public.customer_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  app_id uuid NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  trading_name text,
  registration_number text,
  vat_number text,
  email text,
  phone text,
  website text,
  industry text,
  billing_line1 text,
  billing_line2 text,
  billing_suburb text,
  billing_city text,
  billing_province text,
  billing_postal_code text,
  billing_country text,
  delivery_same_as_billing boolean NOT NULL DEFAULT true,
  delivery_line1 text,
  delivery_line2 text,
  delivery_suburb text,
  delivery_city text,
  delivery_province text,
  delivery_postal_code text,
  delivery_country text,
  is_trade_customer boolean NOT NULL DEFAULT false,
  mis_account_number text,
  credit_limit numeric NOT NULL DEFAULT 0,
  payment_terms_days integer NOT NULL DEFAULT 30,
  default_discount_pct numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_companies_tenant_idx ON public.customer_companies (tenant_id, app_id);
CREATE INDEX customer_companies_branch_idx ON public.customer_companies (branch_id);
CREATE INDEX customer_companies_name_idx ON public.customer_companies (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_companies TO authenticated;
GRANT ALL ON public.customer_companies TO service_role;

ALTER TABLE public.customer_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_companies_platform_admin ON public.customer_companies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY customer_companies_staff_all ON public.customer_companies
  FOR ALL TO authenticated
  USING (user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (user_is_staff_for_branch(app_id, tenant_id, branch_id));

CREATE TRIGGER customer_companies_set_updated_at
  BEFORE UPDATE ON public.customer_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_memberships
  ADD COLUMN company_id uuid REFERENCES public.customer_companies(id) ON DELETE SET NULL,
  ADD COLUMN is_primary_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN job_title text;

CREATE INDEX tenant_memberships_company_idx ON public.tenant_memberships (company_id);

CREATE POLICY customer_companies_customer_read ON public.customer_companies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.profile_id = auth.uid()
      AND m.company_id = customer_companies.id
      AND m.is_active
  ));