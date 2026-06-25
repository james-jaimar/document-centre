DO $$
DECLARE
  oid uuid := '2a4f7a80-a1c0-4010-a495-517d88abcc36';
BEGIN
  DELETE FROM public.timeline_events WHERE order_id = oid;
  DELETE FROM public.status_history WHERE order_id = oid;
  DELETE FROM public.messages WHERE order_id = oid;
  DELETE FROM public.job_proofs WHERE order_id = oid;
  DELETE FROM public.order_jobs WHERE order_id = oid;
  DELETE FROM public.payments WHERE order_id = oid;
  DELETE FROM public.order_payment_attempts WHERE order_id = oid;
  DELETE FROM public.order_invoices WHERE order_id = oid;
  DELETE FROM public.order_pricing_snapshots WHERE order_id = oid;
  DELETE FROM public.order_addresses WHERE order_id = oid;
  DELETE FROM public.order_documents WHERE order_id = oid;
  DELETE FROM public.order_items WHERE order_id = oid;
  DELETE FROM public.order_legal_acceptances WHERE order_id = oid;
  DELETE FROM public.order_adjustments WHERE order_id = oid;
  DELETE FROM public.orders WHERE id = oid;
END $$;