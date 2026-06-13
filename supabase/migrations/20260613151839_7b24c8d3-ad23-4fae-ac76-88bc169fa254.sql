CREATE OR REPLACE FUNCTION public.notify_enqueue_print_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  trigger_event text := NULL;
BEGIN
  -- Skip if order is in a terminal state
  IF NEW.admin_status IN ('cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Detect the transition that should fire auto-assemble.
  -- payment_status: 'paid' (online / manual mark-as-paid) or
  -- 'on_account' (credit-account submission).
  IF NEW.payment_status IN ('paid', 'on_account')
     AND COALESCE(OLD.payment_status, '') NOT IN ('paid', 'on_account')
     AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    trigger_event := 'payment_' || NEW.payment_status;
  ELSIF NEW.admin_status = 'approved'
     AND COALESCE(OLD.admin_status, '') <> 'approved' THEN
    trigger_event := 'admin_approved';
  END IF;

  IF trigger_event IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/enqueue-print-ready',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Token', 'df650cd4215c0255870aa6e97f733e3c6cc4f1f1a406627d66510567454988a6'
      ),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'source', trigger_event
      ),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- best-effort; operators can re-assemble manually from the UI
  END;

  RETURN NEW;
END;
$function$;