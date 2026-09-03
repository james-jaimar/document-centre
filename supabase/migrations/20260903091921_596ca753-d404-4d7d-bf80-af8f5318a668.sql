ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS payment_terms_mode text NOT NULL DEFAULT 'account';

ALTER TABLE public.customer_companies
  ADD CONSTRAINT customer_companies_payment_terms_mode_chk
  CHECK (payment_terms_mode IN ('account','prepaid'));

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS payment_terms_mode text;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_payment_terms_mode_chk
  CHECK (payment_terms_mode IS NULL OR payment_terms_mode IN ('account','prepaid'));