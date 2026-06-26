ALTER TABLE public.order_adjustments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_order_adjustments_status_refund_pending
  ON public.order_adjustments(order_id)
  WHERE status = 'refund_pending';