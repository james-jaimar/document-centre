-- Reduce email-dispatcher cron from every-minute to every-5-minutes.
-- Uses cron.alter_job so we modify only the schedule field — the existing
-- command (which contains a project-specific anon key) stays untouched
-- and is not introduced into the migration body.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'email-dispatcher-tick';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := v_jobid,
      schedule := '*/5 * * * *'
    );
  END IF;
END $$;
