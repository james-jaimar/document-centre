CREATE OR REPLACE FUNCTION public.rollup_order_status(p_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_any_hold boolean; v_all_completed boolean; v_all_ready_or_done boolean;
  v_any_proof_pending boolean; v_any_in_production boolean; v_any_sent_to_print boolean;
BEGIN
  SELECT bool_or(job_status = 'on_hold'), bool_and(job_status = 'completed'),
    bool_and(job_status IN ('ready','completed')), bool_or(job_status IN ('awaiting_proof','proof_ready')),
    bool_or(job_status IN ('in_production','outsourced','qa','approved_for_production','sent_to_print')),
    bool_or(job_status = 'sent_to_print')
  INTO v_any_hold, v_all_completed, v_all_ready_or_done, v_any_proof_pending, v_any_in_production, v_any_sent_to_print
  FROM public.order_jobs WHERE order_id = p_order_id AND job_status <> 'cancelled';

  UPDATE public.orders
  SET
    customer_status = CASE
      WHEN payment_status = 'unpaid' AND coalesce(amount_due, 0) > 0
           AND coalesce(metadata->>'payment_method','') <> 'account' THEN 'awaiting_payment'
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
      WHEN payment_status = 'unpaid' AND coalesce(amount_due, 0) > 0
           AND coalesce(metadata->>'payment_method','') <> 'account' THEN 'new_order'
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

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.orders
    WHERE metadata->>'payment_method' = 'account' AND customer_status = 'awaiting_payment'
      AND coalesce(admin_status,'') <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public.order_jobs j WHERE j.order_id = orders.id)
  LOOP PERFORM public.rollup_order_status(r.id); END LOOP;
END $$;