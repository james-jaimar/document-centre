CREATE OR REPLACE FUNCTION public.claim_email_batch(p_worker_id text, p_batch_size integer DEFAULT 50, p_lease_seconds integer DEFAULT 120)
 RETURNS SETOF public.email_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- HARD WALL: only the canonical Cloud Run email worker may claim rows.
  -- worker_id() in the Python sender uses:
  --   cloud_run:<K_SERVICE>:<K_REVISION>:<pid>
  -- Therefore the only accepted prefix is cloud_run:pdf-worker-emails:.
  -- Anything else (legacy VPS Celery worker, local dev, stale systemd unit,
  -- or the non-email Cloud Run services) returns no rows and cannot race the
  -- canonical sender or mishandle graph_oauth tokens.
  IF p_worker_id NOT LIKE 'cloud_run:pdf-worker-emails:%' THEN
    RAISE LOG 'claim_email_batch: refusing non-email-cloud-run worker_id=%', p_worker_id;
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