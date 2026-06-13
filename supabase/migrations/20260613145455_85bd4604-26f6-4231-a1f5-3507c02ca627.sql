
-- 1. Failure flags on order_jobs
ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS auto_assemble_error text,
  ADD COLUMN IF NOT EXISTS auto_assemble_failed_at timestamptz;

-- 2. Drop existing trigger + function so we can recreate cleanly
DROP TRIGGER IF EXISTS trg_orders_payment_print_ready ON public.orders;
DROP FUNCTION IF EXISTS public.notify_enqueue_print_ready();

-- 3. New combined trigger function: fires on payment_status -> paid OR admin_status -> approved.
--    Calls enqueue-print-ready via pg_net with a dedicated webhook token so we don't expose
--    the service-role key inside DB plaintext.
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

  -- Detect the transition that should fire auto-assemble
  IF NEW.payment_status = 'paid'
     AND COALESCE(OLD.payment_status, '') <> 'paid' THEN
    trigger_event := 'payment_paid';
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
    NULL;  -- best-effort; operators can re-assemble manually
  END;

  RETURN NEW;
END;
$function$;

-- 4. Trigger on UPDATE (no OF clause so we see both column changes)
CREATE TRIGGER trg_orders_payment_print_ready
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_enqueue_print_ready();
