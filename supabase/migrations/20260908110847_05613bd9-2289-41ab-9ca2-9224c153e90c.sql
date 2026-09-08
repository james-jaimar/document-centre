ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_opened_by uuid;

CREATE INDEX IF NOT EXISTS orders_unopened_idx
  ON public.orders (tenant_id, submitted_at DESC)
  WHERE first_opened_at IS NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_admin_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_admin_status_check
  CHECK (admin_status = ANY (ARRAY['pending_payment'::text,'new_order'::text,'under_review'::text,'approved'::text,'in_production'::text,'sent_to_print'::text,'qa'::text,'ready_for_dispatch'::text,'dispatched'::text,'completed'::text,'on_hold'::text,'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.rollup_order_status(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_status text;
  v_amount_due numeric;
  v_any_hold boolean;
  v_all_completed boolean;
  v_all_ready_or_done boolean;
  v_any_proof_pending boolean;
  v_any_in_production boolean;
  v_any_sent_to_print boolean;
BEGIN
  SELECT payment_status, amount_due INTO v_payment_status, v_amount_due
  FROM public.orders WHERE id = p_order_id;

  SELECT
    bool_or(job_status = 'on_hold'),
    bool_and(job_status = 'completed'),
    bool_and(job_status IN ('ready','completed')),
    bool_or(job_status IN ('awaiting_proof','proof_ready')),
    bool_or(job_status IN ('in_production','outsourced','qa','approved_for_production','sent_to_print')),
    bool_or(job_status = 'sent_to_print')
  INTO
    v_any_hold,
    v_all_completed,
    v_all_ready_or_done,
    v_any_proof_pending,
    v_any_in_production,
    v_any_sent_to_print
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
      WHEN v_any_sent_to_print THEN 'sent_to_print'
      WHEN v_any_in_production THEN 'in_production'
      WHEN v_any_proof_pending THEN 'under_review'
      WHEN payment_status = 'unpaid' AND coalesce(amount_due, 0) > 0 THEN 'new_order'
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_opened(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = v_tenant
      AND coalesce(tm.is_active, true)
      AND tm.role <> 'customer'
  ) AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET first_opened_at = now(),
      first_opened_by = auth.uid()
  WHERE id = p_order_id
    AND first_opened_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_order_opened(uuid) TO authenticated;