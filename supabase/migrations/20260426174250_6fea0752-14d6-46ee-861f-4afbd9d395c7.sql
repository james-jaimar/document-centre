CREATE OR REPLACE FUNCTION public.notify_email_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only fire for rows that are immediately deliverable
  IF NEW.status <> 'queued' THEN
    RETURN NEW;
  END IF;

  IF NEW.next_attempt_at IS NOT NULL AND NEW.next_attempt_at > now() THEN
    -- Scheduled for later — leave it for the cron to pick up
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to the dispatcher (same auth pattern as the cron job)
  BEGIN
    PERFORM net.http_post(
      url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/email-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmRodGFxb3VteW9ranFhcWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODE5NzgsImV4cCI6MjA4OTA1Nzk3OH0.RUTPHUm_hHpeB59pZXnEcaCFtr7PkfCAw0-lvXuG9WA'
      ),
      body := jsonb_build_object('source', 'push_trigger', 'outbox_id', NEW.id),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net hiccup — cron is the safety net
    NULL;
  END;

  RETURN NEW;
END;
$$;