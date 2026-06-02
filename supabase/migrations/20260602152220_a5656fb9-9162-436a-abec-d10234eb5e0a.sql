CREATE OR REPLACE FUNCTION public.claim_email_batch(
  p_worker_id text,
  p_batch_size integer DEFAULT 50,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.email_outbox
    WHERE status IN ('queued','retry')
      AND (scheduled_for IS NULL OR scheduled_for <= now())
    ORDER BY scheduled_for NULLS FIRST, queued_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox o
     SET status = 'sending',
         claimed_by = p_worker_id,
         claimed_at = now(),
         worker_lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = o.attempts + 1
    FROM due
   WHERE o.id = due.id
  RETURNING o.*;
END;
$$;