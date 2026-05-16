
-- Smart print-ready pipeline: add report columns and payment trigger.

ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS assembly_report jsonb,
  ADD COLUMN IF NOT EXISTS print_ready_assembled_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_ready_spec_hash text;

-- Trigger function: when an order transitions to payment_status='paid',
-- fan out a fire-and-forget HTTP call to the enqueue-print-ready edge fn.
CREATE OR REPLACE FUNCTION public.notify_enqueue_print_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Only act on the transition into "paid".
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF OLD.payment_status = 'paid' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/enqueue-print-ready',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmRodGFxb3VteW9ranFhcWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODE5NzgsImV4cCI6MjA4OTA1Nzk3OH0.RUTPHUm_hHpeB59pZXnEcaCFtr7PkfCAw0-lvXuG9WA'
      ),
      body := jsonb_build_object('order_id', NEW.id, 'source', 'payment_trigger'),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- best-effort; operators can re-assemble manually
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_payment_print_ready ON public.orders;
CREATE TRIGGER trg_orders_payment_print_ready
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_enqueue_print_ready();
