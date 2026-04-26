-- 1. Store the service-role key in Vault (idempotent)
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'email_dispatcher_service_role_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      current_setting('app.settings.service_role_key', true),
      'email_dispatcher_service_role_key',
      'Service role key used by the email_outbox push trigger to invoke the email-dispatcher edge function'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If app.settings.service_role_key is not set in this environment, leave the secret unset.
  -- The trigger will fall back to no-op and the cron will deliver the email.
  NULL;
END $$;

-- 2. Helper function: asynchronously ping the email dispatcher via pg_net
CREATE OR REPLACE FUNCTION public.notify_email_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_service_key text;
  v_project_url text := 'https://lcvdhtaqoumyokjqaqfw.supabase.co';
BEGIN
  -- Only fire for rows that are immediately deliverable
  IF NEW.status <> 'queued' THEN
    RETURN NEW;
  END IF;

  IF NEW.next_attempt_at IS NOT NULL AND NEW.next_attempt_at > now() THEN
    -- Scheduled for later — leave it for the cron to pick up
    RETURN NEW;
  END IF;

  -- Read service-role key from Vault
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_dispatcher_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  IF v_service_key IS NULL THEN
    -- No key available; cron will catch this row in the next tick
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to the dispatcher
  BEGIN
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/email-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
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

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS email_outbox_push ON public.email_outbox;
CREATE TRIGGER email_outbox_push
AFTER INSERT ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.notify_email_dispatcher();