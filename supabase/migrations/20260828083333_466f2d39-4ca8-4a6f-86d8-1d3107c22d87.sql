ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS is_trade_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mis_account_number text;