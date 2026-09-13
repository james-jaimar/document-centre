ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_sample_pack boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_sample_pack_idx
  ON public.orders (tenant_id, created_at DESC)
  WHERE is_sample_pack;

ALTER TABLE public.supplier_offerings
  ADD COLUMN IF NOT EXISTS is_sample_pack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_trade_price_minor integer;

ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS sample_pack_allowance integer NOT NULL DEFAULT 1;