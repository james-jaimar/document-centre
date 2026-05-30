-- Fix order status rollup so unpaid orders stay as "new_order" admin status
-- (was always defaulting to "in_production"), and trigger rollup when
-- payment_status changes so customer/admin status both refresh on payment.

CREATE OR REPLACE FUNCTION public.rollup_order_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status text;
  v_amount_due numeric;
  v_any_hold boolean;
  v_all_completed boolean;
  v_all_ready_or_done boolean;
  v_any_proof_pending boolean;
  v_any_in_production boolean;
BEGIN
  SELECT payment_status, amount_due INTO v_payment_status, v_amount_due
  FROM public.orders WHERE id = p_order_id;

  SELECT
    bool_or(job_status = 'on_hold'),
    bool_and(job_status = 'completed'),
    bool_and(job_status IN ('ready','completed')),
    bool_or(job_status IN ('awaiting_proof','proof_ready')),
    bool_or(job_status IN ('in_production','outsourced','qa','approved_for_production'))
  INTO
    v_any_hold,
    v_all_completed,
    v_all_ready_or_done,
    v_any_proof_pending,
    v_any_in_production
  FROM public.order_jobs
  WHERE order_id = p_order_id
    AND job_status <> 'cancelled';

  UPDATE public.orders
  SET
    customer_status = CASE
      WHEN payment_status = 'unpaid' AND coalesce(amount_due, 0) > 0 THEN 'awaiting_payment'
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready'
      WHEN v_any_proof_pending THEN 'proof_pending'
      ELSE 'in_production'
    END,
    admin_status = CASE
      WHEN admin_status = 'cancelled' THEN 'cancelled'
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready_for_dispatch'
      WHEN v_any_in_production THEN 'in_production'
      WHEN v_any_proof_pending THEN 'under_review'
      -- Unpaid and no production work started → stay as "new"
      WHEN payment_status = 'unpaid' AND coalesce(amount_due, 0) > 0 THEN 'new_order'
      -- Paid (or zero-due) but no production work yet → approved, ready to start
      ELSE 'approved'
    END,
    fulfilment_status = CASE
      WHEN v_all_completed THEN 'delivered'
      WHEN v_all_ready_or_done THEN 'ready'
      WHEN v_any_in_production THEN 'in_production'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- Trigger rollup when payment_status changes on the order
CREATE OR REPLACE FUNCTION public.trg_rollup_on_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
    PERFORM public.rollup_order_status(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_rollup_on_payment ON public.orders;
CREATE TRIGGER trg_orders_rollup_on_payment
AFTER UPDATE OF payment_status, amount_paid ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_rollup_on_payment_change();

-- Backfill: re-run rollup on all existing non-cancelled orders so the
-- screenshot-style "in_production but unpaid" rows reset to "new_order".
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders
            WHERE admin_status <> 'cancelled'
              AND order_status NOT IN ('cart','draft')
  LOOP
    PERFORM public.rollup_order_status(r.id);
  END LOOP;
END $$;