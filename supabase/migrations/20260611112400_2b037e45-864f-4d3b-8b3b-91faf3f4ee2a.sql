CREATE OR REPLACE FUNCTION public.release_stuck_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.email_outbox
     SET status = 'queued',
         claimed_by = NULL,
         claimed_at = NULL,
         worker_lease_until = NULL,
         locked_by = NULL,
         locked_at = NULL,
         next_attempt_at = now()
   WHERE status = 'sending'
     AND worker_lease_until IS NOT NULL
     AND worker_lease_until < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;