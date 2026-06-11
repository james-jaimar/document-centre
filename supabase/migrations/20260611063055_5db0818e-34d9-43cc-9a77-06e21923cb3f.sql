DROP TRIGGER IF EXISTS email_outbox_push ON public.email_outbox;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'email-dispatcher-tick'
  LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END;
$$;