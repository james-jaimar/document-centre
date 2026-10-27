-- Regression check against an already-sent document email. No email is queued
-- for delivery: the existing row is locked and every change is rolled back.
BEGIN;
CREATE TEMP TABLE invoice_send_fixture ON COMMIT DROP AS
SELECT e.id AS email_id, i.id AS invoice_id, i.order_id,
  COALESCE((i.metadata->>'send_count')::integer, 0) AS prior_count,
  (SELECT count(*) FROM public.timeline_events t WHERE t.order_id=i.order_id
    AND t.event_type='invoice_sent' AND t.metadata->>'email_outbox_id'=e.id::text) AS prior_events
FROM public.email_outbox e
JOIN public.order_invoices i ON i.id::text=e.metadata->>'invoice_id'
  AND i.order_id=e.related_id AND i.tenant_id=e.tenant_id AND i.app_id=e.app_id
JOIN public.orders o ON o.id=i.order_id AND o.branch_id IS NOT DISTINCT FROM e.branch_id
WHERE e.status='sent'
  AND NOT EXISTS (SELECT 1 FROM public.timeline_events t WHERE t.order_id=i.order_id
    AND t.event_type='invoice_sent' AND t.metadata->>'email_outbox_id'=e.id::text)
ORDER BY e.sent_at DESC LIMIT 1;
SELECT 1 / CASE WHEN count(*) = 1 THEN 1 ELSE 0 END AS fixture_exists FROM invoice_send_fixture;
UPDATE public.email_outbox SET status='queued' WHERE id IN (SELECT email_id FROM invoice_send_fixture);
UPDATE public.email_outbox SET status='sent' WHERE id IN (SELECT email_id FROM invoice_send_fixture);
SELECT 1 / CASE WHEN (i.metadata->>'send_count')::integer=f.prior_count+1
  AND i.metadata->>'sent_to'=e.to_email
  AND (i.metadata->>'last_sent_at')::timestamptz=e.sent_at
  AND (SELECT count(*) FROM public.timeline_events t WHERE t.order_id=f.order_id
    AND t.event_type='invoice_sent' AND t.metadata->>'email_outbox_id'=e.id::text)=f.prior_events+1
  THEN 1 ELSE 0 END AS confirmed_send_recorded
FROM invoice_send_fixture f JOIN public.order_invoices i ON i.id=f.invoice_id
JOIN public.email_outbox e ON e.id=f.email_id;
UPDATE public.email_outbox SET status='sent' WHERE id IN (SELECT email_id FROM invoice_send_fixture);
SELECT 1 / CASE WHEN (i.metadata->>'send_count')::integer=f.prior_count+1
  AND (SELECT count(*) FROM public.timeline_events t WHERE t.order_id=f.order_id
    AND t.event_type='invoice_sent' AND t.metadata->>'email_outbox_id'=f.email_id::text)=f.prior_events+1
  THEN 1 ELSE 0 END AS repeated_update_deduplicated
FROM invoice_send_fixture f JOIN public.order_invoices i ON i.id=f.invoice_id;
ROLLBACK;