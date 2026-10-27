CREATE OR REPLACE FUNCTION public.track_order_invoice_email_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.order_invoices%ROWTYPE;
  ord public.orders%ROWTYPE;
  sent_time timestamptz;
  document_label text;
BEGIN
  IF NEW.status <> 'sent' OR NEW.related_type IS DISTINCT FROM 'order' OR NEW.related_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'sent' THEN RETURN NEW; END IF;
  END IF;
  IF COALESCE(NEW.metadata->>'invoice_id', '') = '' THEN RETURN NEW; END IF;
  SELECT * INTO inv FROM public.order_invoices
    WHERE id::text = NEW.metadata->>'invoice_id'
      AND order_id = NEW.related_id AND tenant_id = NEW.tenant_id AND app_id = NEW.app_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO ord FROM public.orders
    WHERE id = inv.order_id AND tenant_id = inv.tenant_id AND app_id = inv.app_id;
  IF NOT FOUND OR NEW.branch_id IS DISTINCT FROM ord.branch_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.timeline_events
    WHERE order_id = ord.id AND event_type = 'invoice_sent' AND metadata->>'email_outbox_id' = NEW.id::text) THEN
    RETURN NEW;
  END IF;
  sent_time := COALESCE(NEW.sent_at, now());
  document_label := CASE inv.kind WHEN 'proforma' THEN 'Pro forma' WHEN 'invoice' THEN 'Tax invoice' WHEN 'credit_note' THEN 'Credit note' WHEN 'receipt' THEN 'Receipt' ELSE 'Invoice' END;
  UPDATE public.order_invoices
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_sent_at', sent_time, 'sent_to', NEW.to_email,
      'send_count', COALESCE((metadata->>'send_count')::integer, 0) + 1,
      'last_email_outbox_id', NEW.id)
    WHERE id = inv.id;
  INSERT INTO public.timeline_events (app_id, tenant_id, branch_id, order_id, actor_type,
    event_type, visibility, description, metadata, created_at)
  VALUES (ord.app_id, ord.tenant_id, ord.branch_id, ord.id, 'system', 'invoice_sent', 'admin',
    document_label || ' ' || inv.invoice_number || ' sent to ' || NEW.to_email,
    jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number,
      'invoice_kind', inv.kind, 'email_outbox_id', NEW.id, 'sent_to', NEW.to_email, 'sent_at', sent_time), sent_time);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_order_invoice_email_sent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_invoice_email_sent() TO service_role;
CREATE TRIGGER track_order_invoice_email_sent
AFTER INSERT OR UPDATE OF status ON public.email_outbox
FOR EACH ROW EXECUTE FUNCTION public.track_order_invoice_email_sent();