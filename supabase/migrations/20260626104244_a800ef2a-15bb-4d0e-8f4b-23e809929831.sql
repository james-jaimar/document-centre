
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS provider_refund_id text;

CREATE INDEX IF NOT EXISTS idx_payments_provider_intent
  ON public.payments(order_id, provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_provider_refund
  ON public.payments(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

-- Allow refund_initiated as a new payment status (in flight, not yet confirmed by webhook).
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('initiated','pending','paid','failed','cancelled','refunded','refund_initiated','refund_failed'));
