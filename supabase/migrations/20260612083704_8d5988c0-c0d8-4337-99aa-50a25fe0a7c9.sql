CREATE OR REPLACE FUNCTION public.claim_email_batch(p_worker_id text, p_batch_size integer DEFAULT 50, p_lease_seconds integer DEFAULT 120)
 RETURNS SETOF public.email_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- HARD WALL: only Cloud Run pdf-worker-emails may claim rows.
  -- worker_id() in the Python sender uses the prefix 'cloud_run:' when
  -- running on Cloud Run (K_SERVICE/K_REVISION set). Anything else
  -- (legacy VPS Celery worker, local dev, stale systemd unit) returns no
  -- rows so it cannot race the canonical sender or mishandle graph_oauth.
  IF p_worker_id NOT LIKE 'cloud_run:%' THEN
    RAISE LOG 'claim_email_batch: refusing non-cloud-run worker_id=%', p_worker_id;
    RETURN;
  END IF;

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
$function$;