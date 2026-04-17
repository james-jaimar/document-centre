
-- Phase 1+2+3: Manual payments, invoices, transactional emails

-- 1) order_invoices: tax invoices, proformas, credit notes, receipts
CREATE TABLE public.order_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.apps(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'invoice', -- proforma | invoice | credit_note | receipt
  storage_bucket TEXT NOT NULL DEFAULT 'documents',
  storage_path TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_order_invoices_order ON public.order_invoices(order_id);
CREATE INDEX idx_order_invoices_tenant ON public.order_invoices(tenant_id);

ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_invoices_select_policy ON public.order_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_invoices.order_id
        AND (
          public.user_is_staff_for(o.app_id, o.tenant_id)
          OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
        )
    )
  );

-- 2) email_log: track sent transactional emails (idempotency + audit)
CREATE TABLE public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES public.apps(id),
  tenant_id UUID REFERENCES public.tenants(id),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- sent | failed | skipped
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_log_order ON public.email_log(order_id);
CREATE INDEX idx_email_log_event ON public.email_log(order_id, event_key);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_select_staff ON public.email_log
  FOR SELECT USING (
    tenant_id IS NOT NULL AND public.user_is_staff_for(app_id, tenant_id)
  );

-- 3) Seed invoice number_sequences for existing apps
INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
SELECT a.id, 'invoice', 'INV', 1000
FROM public.apps a
WHERE NOT EXISTS (
  SELECT 1 FROM public.number_sequences ns
  WHERE ns.app_id = a.id AND ns.sequence_type = 'invoice'
);

-- 4) Per-tenant invoice numbering helper
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_tenant_id UUID, p_app_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next BIGINT;
  v_year TEXT;
BEGIN
  -- Per-tenant prefix from tenant_settings (fall back to app sequence prefix)
  SELECT COALESCE(setting_value #>> '{}', NULL) INTO v_prefix
  FROM public.tenant_settings
  WHERE tenant_id = p_tenant_id
    AND category = 'financial'
    AND setting_key = 'invoice_prefix'
  LIMIT 1;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    SELECT prefix INTO v_prefix FROM public.number_sequences
    WHERE app_id = p_app_id AND sequence_type = 'invoice';
  END IF;

  IF v_prefix IS NULL THEN
    v_prefix := 'INV';
  END IF;

  v_next := public.next_number(p_app_id, 'invoice');
  v_year := to_char(now(), 'YYYY');

  RETURN v_prefix || '-' || v_year || '-' || lpad(v_next::TEXT, 5, '0');
END;
$$;

-- 5) RPC to issue an invoice atomically (returns invoice_number)
CREATE OR REPLACE FUNCTION public.issue_invoice_number(p_tenant_id UUID, p_app_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_invoice_number(p_tenant_id, p_app_id);
END;
$$;
