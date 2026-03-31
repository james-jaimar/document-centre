
-- Fix function search_path warnings
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.map_customer_job_status(p_job_status text, p_payment_status text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_payment_status = 'unpaid' AND p_job_status = 'new_job' THEN 'awaiting_payment'
    WHEN p_job_status IN ('awaiting_proof','proof_ready') THEN 'proof_pending'
    WHEN p_job_status IN ('new_job','awaiting_files','proof_approved','approved_for_production','in_production','outsourced','qa') THEN 'in_production'
    WHEN p_job_status = 'ready' THEN 'ready'
    WHEN p_job_status = 'completed' THEN 'completed'
    WHEN p_job_status = 'on_hold' THEN 'on_hold'
    WHEN p_job_status = 'cancelled' THEN 'cancelled'
    ELSE 'in_production'
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_job_number(p_order_number text, p_sequence_no int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_order_number || '-' || p_sequence_no::text;
$$;
