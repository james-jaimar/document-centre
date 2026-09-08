ALTER TABLE public.order_jobs DROP CONSTRAINT IF EXISTS order_jobs_status_check;
ALTER TABLE public.order_jobs ADD CONSTRAINT order_jobs_status_check
  CHECK (job_status = ANY (ARRAY['new_job'::text,'awaiting_files'::text,'awaiting_proof'::text,'proof_ready'::text,'proof_approved'::text,'approved_for_production'::text,'in_production'::text,'sent_to_print'::text,'outsourced'::text,'qa'::text,'ready'::text,'completed'::text,'on_hold'::text,'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.map_customer_job_status(p_job_status text, p_payment_status text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_payment_status = 'unpaid' AND p_job_status = 'new_job' THEN 'awaiting_payment'
    WHEN p_job_status IN ('awaiting_proof','proof_ready') THEN 'proof_pending'
    WHEN p_job_status IN ('new_job','awaiting_files','proof_approved','approved_for_production','in_production','sent_to_print','outsourced','qa') THEN 'in_production'
    WHEN p_job_status = 'ready' THEN 'ready'
    WHEN p_job_status = 'completed' THEN 'completed'
    WHEN p_job_status = 'on_hold' THEN 'on_hold'
    WHEN p_job_status = 'cancelled' THEN 'cancelled'
    ELSE 'in_production'
  END;
$function$;