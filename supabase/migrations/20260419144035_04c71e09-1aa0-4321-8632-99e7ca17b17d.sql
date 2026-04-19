CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Drop existing schedule if any
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'email-dispatcher-tick';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END$$;

SELECT cron.schedule(
  'email-dispatcher-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/email-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmRodGFxb3VteW9ranFhcWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODE5NzgsImV4cCI6MjA4OTA1Nzk3OH0.RUTPHUm_hHpeB59pZXnEcaCFtr7PkfCAw0-lvXuG9WA'
    ),
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);