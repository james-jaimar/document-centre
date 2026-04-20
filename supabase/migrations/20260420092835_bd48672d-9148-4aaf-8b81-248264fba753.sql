CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-drafts-daily') THEN
    PERFORM cron.unschedule('cleanup-stale-drafts-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-stale-drafts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/cleanup-stale-drafts',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmRodGFxb3VteW9ranFhcWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODE5NzgsImV4cCI6MjA4OTA1Nzk3OH0.RUTPHUm_hHpeB59pZXnEcaCFtr7PkfCAw0-lvXuG9WA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);