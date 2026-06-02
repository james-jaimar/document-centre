-- Switch the email outbox push trigger from pg_net → pg_notify.
-- A long-lived LISTENer on the VPS (document-centre-listener-emails.service)
-- picks up 'email_enqueued' notifications and immediately calls
-- email.scan_outbox.delay(), giving near-instant dispatch without a
-- public webhook surface.
--
-- Beat keeps running as a safety net (interval bumped to 30s in code) to
-- pick up rows we missed if the listener was down, plus future-dated
-- scheduled_for rows.

CREATE OR REPLACE FUNCTION public.notify_email_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire for rows that are immediately deliverable.
  IF NEW.status <> 'queued' THEN
    RETURN NEW;
  END IF;

  IF NEW.next_attempt_at IS NOT NULL AND NEW.next_attempt_at > now() THEN
    -- Scheduled for later — leave it for the safety-net beat.
    RETURN NEW;
  END IF;

  -- Fire-and-forget LISTEN/NOTIFY. Payload is just the outbox id; the
  -- listener calls scan_outbox which atomically claims a batch (so
  -- duplicate notifies are harmless).
  PERFORM pg_notify('email_enqueued', NEW.id::text);

  RETURN NEW;
END;
$function$;