-- =====================================================================
-- GASA order system schema
-- Ported from Document Centre. Orders engine only.
--
-- Column names are kept identical to Document Centre on purpose, so the
-- engine source in reference/ drops in with no renaming. Read
-- "tenant_id" as "brand owner id". "branch_id" is kept, nullable and
-- unused, so a storefront/branch layer can be added later without a
-- migration of every table.
--
-- Run this as ONE migration. Order matters: table, grants, RLS, policy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Prerequisite: membership table used by every access rule.
--    If GASA already has its own, delete this block and rewrite the two
--    helper functions in section 2 against your own table.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid,
  profile_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'customer',  -- owner|admin|sales|production|accounts|customer
  is_active boolean NOT NULL DEFAULT true,
  can_view_all_orders boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'cart','draft','quoted','confirmed','in_production','quality_check',
    'ready_for_collection','dispatched','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_type AS ENUM ('collection','delivery','courier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.build_status AS ENUM ('draft','building','ready','quoted','ordered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. Access helpers. SECURITY DEFINER so policies never recurse.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_is_staff_for_tenant(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
     WHERE tm.profile_id = auth.uid()
       AND tm.tenant_id = p_tenant_id
       AND tm.is_active
       AND tm.role <> 'customer');
$$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
     WHERE tm.profile_id = auth.uid()
       AND tm.tenant_id = p_tenant_id
       AND tm.is_active
       AND tm.role IN ('owner','admin'));
$$;

-- Staff of the tenant, or the customer who placed it.
CREATE OR REPLACE FUNCTION public.user_can_read_order(
  p_tenant_id uuid, p_ordered_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_ordered_by = auth.uid()
      OR public.user_is_staff_for_tenant(p_tenant_id);
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_staff_for_tenant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_read_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_staff_for_tenant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_read_order(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------
-- 3. Numbering
-- ---------------------------------------------------------------------

CREATE TABLE public.number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  tenant_id uuid,
  branch_id uuid,
  sequence_type text NOT NULL,          -- 'order' | 'invoice'
  prefix text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX number_sequences_scope_uq ON public.number_sequences (
  app_id,
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  sequence_type);

GRANT SELECT ON public.number_sequences TO authenticated;
GRANT ALL ON public.number_sequences TO service_role;
ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sequences_select_admin" ON public.number_sequences
  FOR SELECT TO authenticated USING (public.user_is_tenant_admin(tenant_id));

-- Atomic counter. Never count rows to make a number.
CREATE OR REPLACE FUNCTION public.next_number(
  p_app_id uuid, p_sequence_type text,
  p_tenant_id uuid DEFAULT NULL, p_branch_id uuid DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next bigint; v_app_last bigint; v_prefix text;
BEGIN
  UPDATE public.number_sequences SET last_value = last_value + 1
   WHERE app_id = p_app_id AND sequence_type = p_sequence_type
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id
     AND branch_id IS NOT DISTINCT FROM p_branch_id
  RETURNING last_value INTO v_next;
  IF v_next IS NOT NULL THEN RETURN v_next; END IF;

  SELECT last_value, prefix INTO v_app_last, v_prefix
    FROM public.number_sequences
   WHERE app_id = p_app_id AND sequence_type = p_sequence_type
     AND tenant_id IS NULL AND branch_id IS NULL LIMIT 1;

  INSERT INTO public.number_sequences (app_id, sequence_type, tenant_id, branch_id, prefix, last_value)
  VALUES (p_app_id, p_sequence_type, p_tenant_id, p_branch_id,
          COALESCE(v_prefix, upper(left(p_sequence_type,3))), COALESCE(v_app_last, 1000))
  ON CONFLICT (app_id,
               COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
               sequence_type) DO NOTHING;

  UPDATE public.number_sequences SET last_value = last_value + 1
   WHERE app_id = p_app_id AND sequence_type = p_sequence_type
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id
     AND branch_id IS NOT DISTINCT FROM p_branch_id
  RETURNING last_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Missing number sequence for app % type %', p_app_id, p_sequence_type;
  END IF;
  RETURN v_next;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_order_number(p_app_id uuid, p_tenant_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_num bigint;
BEGIN
  SELECT prefix INTO v_prefix FROM public.number_sequences
   WHERE app_id = p_app_id AND sequence_type = 'order'
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id AND branch_id IS NULL LIMIT 1;
  IF v_prefix IS NULL THEN
    SELECT prefix INTO v_prefix FROM public.number_sequences
     WHERE app_id = p_app_id AND sequence_type = 'order'
       AND tenant_id IS NULL AND branch_id IS NULL LIMIT 1;
  END IF;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Missing order sequence prefix for app %', p_app_id; END IF;
  v_num := public.next_number(p_app_id, 'order', p_tenant_id, NULL);
  RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.issue_invoice_number(p_tenant_id uuid, p_app_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_next bigint;
BEGIN
  SELECT prefix INTO v_prefix FROM public.number_sequences
   WHERE app_id = p_app_id AND sequence_type = 'invoice'
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'INV');
  v_next := public.next_number(p_app_id, 'invoice', p_tenant_id, NULL);
  RETURN v_prefix || '-' || to_char(now(),'YYYY') || '-' || lpad(v_next::text, 5, '0');
END; $$;

-- ---------------------------------------------------------------------
-- 4. Orders
-- ---------------------------------------------------------------------

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid,
  tenant_id uuid,                       -- brand owner
  branch_id uuid,                       -- reserved, unused today
  user_id uuid NOT NULL,                -- auth user who owns the order
  ordered_by_profile_id uuid,
  created_by_admin_profile_id uuid,

  order_number text,
  external_order_ref text,
  source_channel text,
  storefront_name text,

  customer_email text,
  customer_name text,
  company_name text,
  po_number text,
  cost_centre text,

  -- statuses: see 01-architecture.md section 4
  order_status public.order_status NOT NULL DEFAULT 'draft',
  admin_status text NOT NULL DEFAULT 'new_order',
  customer_status text NOT NULL DEFAULT 'awaiting_payment',
  payment_status text NOT NULL DEFAULT 'unpaid',
  fulfilment_status text NOT NULL DEFAULT 'pending',
  fulfillment_type public.fulfillment_type,

  -- money: written by sync_order_amounts(), not by the app
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  delivery_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,   -- legacy mirror of total_amount
  discount_code text,
  discount_snapshot jsonb,

  date_required date,
  turnaround_time_text text,
  notes text,
  notes_internal text,
  notes_customer text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  tracking_number text,
  tracking_carrier text,
  dispatched_at timestamptz,
  ready_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  first_opened_at timestamptz,
  first_opened_by uuid,

  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- EXTENSION POINT: credit accounts, supplier mirroring, quotes and
  -- sample packs each added their own columns here in Document Centre.
);

CREATE INDEX orders_tenant_status_idx ON public.orders (tenant_id, admin_status);
CREATE INDEX orders_user_idx ON public.orders (user_id);
CREATE UNIQUE INDEX orders_number_uq ON public.orders (order_number) WHERE order_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (public.user_can_read_order(tenant_id, ordered_by_profile_id) OR user_id = auth.uid());
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_update_staff" ON public.orders FOR UPDATE TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id))
  WITH CHECK (public.user_is_staff_for_tenant(tenant_id));

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Order jobs — one thing being made
-- ---------------------------------------------------------------------

CREATE TABLE public.order_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  app_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid,

  job_number text NOT NULL,
  sequence_no integer NOT NULL,
  external_job_ref text,
  external_product_key text,

  product_name text NOT NULL,
  product_category text,
  job_name text,

  job_status text NOT NULL DEFAULT 'new_job',
  customer_job_status text NOT NULL DEFAULT 'in_production',
  proof_status text NOT NULL DEFAULT 'not_required',
  file_status text NOT NULL DEFAULT 'pending',
  urgency text NOT NULL DEFAULT 'normal',

  quantity numeric NOT NULL DEFAULT 0,
  unit_label text,
  qty_sent numeric NOT NULL DEFAULT 0,
  qty_remaining numeric NOT NULL DEFAULT 0,

  -- frozen at order time — never recalculated
  net_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 15,
  gross_price numeric NOT NULL DEFAULT 0,
  weight_kg numeric,

  assigned_to_profile_id uuid,

  -- frozen copy of what was ordered — never join back to the live catalogue
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  production_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  integration_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  ready_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- EXTENSION POINT: Document Centre added print artefact paths and
  -- imposition columns here. GASA would add mockup/artwork paths.
);

CREATE INDEX order_jobs_order_idx ON public.order_jobs (order_id);
CREATE INDEX order_jobs_tenant_status_idx ON public.order_jobs (tenant_id, job_status);

GRANT SELECT, INSERT, UPDATE ON public.order_jobs TO authenticated;
GRANT ALL ON public.order_jobs TO service_role;
ALTER TABLE public.order_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_jobs_select" ON public.order_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = order_jobs.order_id
                    AND (public.user_can_read_order(o.tenant_id, o.ordered_by_profile_id)
                         OR o.user_id = auth.uid())));
CREATE POLICY "order_jobs_write_staff" ON public.order_jobs FOR ALL TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id))
  WITH CHECK (public.user_is_staff_for_tenant(tenant_id));

CREATE TRIGGER order_jobs_set_updated_at BEFORE UPDATE ON public.order_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Adjustments, addresses, documents, invoices, payments, snapshots
-- ---------------------------------------------------------------------

CREATE TABLE public.order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,       -- may be negative
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_adjustments TO authenticated;
GRANT ALL ON public.order_adjustments TO service_role;
ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_adjustments_select" ON public.order_adjustments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_adjustments.order_id
                   AND (public.user_can_read_order(o.tenant_id, o.ordered_by_profile_id)
                        OR o.user_id = auth.uid())));
CREATE POLICY "order_adjustments_write_admin" ON public.order_adjustments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_adjustments.order_id
                   AND public.user_is_tenant_admin(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_adjustments.order_id
                   AND public.user_is_tenant_admin(o.tenant_id)));

CREATE TABLE public.order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  address_type text NOT NULL,              -- 'delivery' | 'billing'
  company_name text, contact_name text,
  line1 text, line2 text, suburb text, city text, province text,
  postal_code text, country text DEFAULT 'South Africa',
  phone text, email text, instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.order_addresses TO authenticated;
GRANT ALL ON public.order_addresses TO service_role;
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_addresses_select" ON public.order_addresses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_addresses.order_id
                   AND (public.user_can_read_order(o.tenant_id, o.ordered_by_profile_id)
                        OR o.user_id = auth.uid())));
CREATE POLICY "order_addresses_insert_owner" ON public.order_addresses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_addresses.order_id
                        AND o.user_id = auth.uid()));
CREATE POLICY "order_addresses_update_staff" ON public.order_addresses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_addresses.order_id
                   AND public.user_is_staff_for_tenant(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_addresses.order_id
                   AND public.user_is_staff_for_tenant(o.tenant_id)));

CREATE TABLE public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL, tenant_id uuid NOT NULL, branch_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  document_type text NOT NULL,             -- artwork | mockup | invoice | proof
  title text, file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'documents',
  storage_path text NOT NULL,
  public_url text, mime_type text, file_size_bytes bigint,
  version_no integer NOT NULL DEFAULT 1,
  is_customer_visible boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.order_documents TO authenticated;
GRANT ALL ON public.order_documents TO service_role;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_documents_select" ON public.order_documents FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id)
         OR (is_customer_visible AND EXISTS (
               SELECT 1 FROM public.orders o WHERE o.id = order_documents.order_id
                 AND o.user_id = auth.uid())));
CREATE POLICY "order_documents_write_staff" ON public.order_documents FOR ALL TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id))
  WITH CHECK (public.user_is_staff_for_tenant(tenant_id));

CREATE TABLE public.order_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL, tenant_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  kind text NOT NULL DEFAULT 'invoice',    -- invoice | proforma | credit_note
  storage_bucket text NOT NULL DEFAULT 'documents',
  storage_path text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX order_invoices_number_uq ON public.order_invoices (tenant_id, invoice_number);
GRANT SELECT ON public.order_invoices TO authenticated;
GRANT ALL ON public.order_invoices TO service_role;
ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_invoices_select" ON public.order_invoices FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id)
         OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_invoices.order_id
                      AND o.user_id = auth.uid()));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  app_id uuid NOT NULL, tenant_id uuid NOT NULL,
  provider text NOT NULL,
  provider_transaction_id text,
  provider_payment_intent_id text,
  provider_refund_id text,
  payment_reference text,
  status text NOT NULL,                    -- pending | paid | failed | refunded
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  initiated_at timestamptz, paid_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_staff" ON public.payments FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id));

CREATE TABLE public.order_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  app_id uuid NOT NULL, tenant_id uuid NOT NULL, branch_id uuid,
  provider text NOT NULL, provider_session_id text,
  status text NOT NULL DEFAULT 'pending',
  amount numeric NOT NULL, currency text NOT NULL DEFAULT 'ZAR',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_payment_attempts TO authenticated;
GRANT ALL ON public.order_payment_attempts TO service_role;
ALTER TABLE public.order_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_attempts_select_staff" ON public.order_payment_attempts FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id));

CREATE TABLE public.order_pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal numeric NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  delivery_amount numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 15,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_pricing_snapshots TO authenticated;
GRANT ALL ON public.order_pricing_snapshots TO service_role;
ALTER TABLE public.order_pricing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_snapshots_select" ON public.order_pricing_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_pricing_snapshots.order_id
                   AND (public.user_is_staff_for_tenant(o.tenant_id) OR o.user_id = auth.uid())));

-- ---------------------------------------------------------------------
-- 7. Timeline and status history
-- ---------------------------------------------------------------------

CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL, tenant_id uuid NOT NULL, branch_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  -- ONLY these three. 'admin' is how internal-only notes are stored.
  visibility text NOT NULL DEFAULT 'both'
    CHECK (visibility IN ('admin','customer','both')),
  actor_type text NOT NULL,                -- staff | customer | system
  actor_profile_id uuid, actor_name text,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX timeline_events_order_idx ON public.timeline_events (order_id, created_at DESC);
GRANT SELECT, INSERT ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline_select" ON public.timeline_events FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id)
         OR (visibility IN ('customer','both')
             AND EXISTS (SELECT 1 FROM public.orders o
                          WHERE o.id = timeline_events.order_id AND o.user_id = auth.uid())));
CREATE POLICY "timeline_insert" ON public.timeline_events FOR INSERT TO authenticated
  WITH CHECK (public.user_is_staff_for_tenant(tenant_id)
              OR EXISTS (SELECT 1 FROM public.orders o
                          WHERE o.id = timeline_events.order_id AND o.user_id = auth.uid()));

CREATE TABLE public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL, tenant_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,               -- 'order' | 'job'
  from_status text, to_status text NOT NULL,
  reason text, changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.status_history TO authenticated;
GRANT ALL ON public.status_history TO service_role;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_history_select_staff" ON public.status_history FOR SELECT TO authenticated
  USING (public.user_is_staff_for_tenant(tenant_id));

-- ---------------------------------------------------------------------
-- 8. The money and status engine. These three are the heart of it.
-- ---------------------------------------------------------------------

-- Customer-facing translation of an internal job status. One place only.
CREATE OR REPLACE FUNCTION public.map_customer_job_status(
  p_job_status text, p_payment_status text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_payment_status = 'unpaid' AND p_job_status = 'new_job' THEN 'awaiting_payment'
    WHEN p_job_status IN ('awaiting_proof','proof_ready') THEN 'proof_pending'
    WHEN p_job_status IN ('new_job','awaiting_files','proof_approved',
                          'approved_for_production','in_production','sent_to_print',
                          'outsourced','qa') THEN 'in_production'
    WHEN p_job_status = 'ready' THEN 'ready'
    WHEN p_job_status = 'completed' THEN 'completed'
    WHEN p_job_status = 'on_hold' THEN 'on_hold'
    WHEN p_job_status = 'cancelled' THEN 'cancelled'
    ELSE 'in_production'
  END;
$$;

-- The ONLY writer of an order's money fields.
CREATE OR REPLACE FUNCTION public.sync_order_amounts(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jobs numeric(12,2); v_adj numeric(12,2); v_subtotal numeric(12,2);
BEGIN
  SELECT coalesce(sum(net_price),0) INTO v_jobs
    FROM public.order_jobs WHERE order_id = p_order_id;
  SELECT coalesce(sum(amount),0) INTO v_adj
    FROM public.order_adjustments WHERE order_id = p_order_id AND status = 'active';
  v_subtotal := v_jobs + v_adj;

  UPDATE public.orders SET
    subtotal = v_subtotal,
    total_amount = round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2),
    total_price  = round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2),
    amount_due   = round((v_subtotal - discount_amount + delivery_amount + vat_amount) - amount_paid, 2),
    payment_status = CASE
      WHEN amount_paid <= 0 THEN 'unpaid'
      WHEN amount_paid >= round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2) THEN 'paid'
      ELSE 'part_paid' END,
    updated_at = now()
  WHERE id = p_order_id;
END; $$;

-- Jobs roll up into the order. Staff never type the order's status directly
-- when jobs disagree with it.
CREATE OR REPLACE FUNCTION public.rollup_order_status(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_any_hold boolean; v_all_completed boolean; v_all_ready_or_done boolean;
  v_any_proof_pending boolean; v_any_in_production boolean; v_any_sent_to_print boolean;
BEGIN
  SELECT bool_or(job_status = 'on_hold'),
         bool_and(job_status = 'completed'),
         bool_and(job_status IN ('ready','completed')),
         bool_or(job_status IN ('awaiting_proof','proof_ready')),
         bool_or(job_status IN ('in_production','outsourced','qa','approved_for_production','sent_to_print')),
         bool_or(job_status = 'sent_to_print')
    INTO v_any_hold, v_all_completed, v_all_ready_or_done,
         v_any_proof_pending, v_any_in_production, v_any_sent_to_print
    FROM public.order_jobs
   WHERE order_id = p_order_id AND job_status <> 'cancelled';

  UPDATE public.orders SET
    customer_status = CASE
      WHEN payment_status = 'unpaid' AND coalesce(amount_due,0) > 0 THEN 'awaiting_payment'
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready'
      WHEN v_any_proof_pending THEN 'proof_pending'
      ELSE 'in_production' END,
    admin_status = CASE
      WHEN admin_status = 'cancelled' THEN 'cancelled'
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready_for_dispatch'
      WHEN v_any_sent_to_print THEN 'sent_to_print'
      WHEN v_any_in_production THEN 'in_production'
      WHEN v_any_proof_pending THEN 'under_review'
      WHEN payment_status = 'unpaid' AND coalesce(amount_due,0) > 0 THEN 'new_order'
      ELSE 'approved' END,
    fulfilment_status = CASE
      WHEN v_all_completed THEN 'delivered'
      WHEN v_all_ready_or_done THEN 'ready'
      WHEN v_any_in_production THEN 'in_production'
      ELSE 'pending' END,
    updated_at = now()
  WHERE id = p_order_id;
END; $$;

-- One trigger keeps derived job fields, order totals and order status honest.
CREATE OR REPLACE FUNCTION public.handle_order_jobs_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.order_jobs SET
    qty_remaining = greatest(quantity - qty_sent, 0),
    customer_job_status = public.map_customer_job_status(
      job_status, (SELECT payment_status FROM public.orders WHERE id = order_id)),
    updated_at = now()
  WHERE id = coalesce(NEW.id, OLD.id);

  PERFORM public.sync_order_amounts(coalesce(NEW.order_id, OLD.order_id));
  PERFORM public.rollup_order_status(coalesce(NEW.order_id, OLD.order_id));
  RETURN NULL;
END; $$;

CREATE TRIGGER order_jobs_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.order_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_jobs_after_write();

CREATE OR REPLACE FUNCTION public.handle_order_adjustments_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_order_amounts(coalesce(NEW.order_id, OLD.order_id));
  PERFORM public.rollup_order_status(coalesce(NEW.order_id, OLD.order_id));
  RETURN NULL;
END; $$;

CREATE TRIGGER order_adjustments_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.order_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_adjustments_after_write();

-- Legacy enum kept in step with the real status.
CREATE OR REPLACE FUNCTION public.sync_order_status_on_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.admin_status = 'cancelled' THEN
    NEW.order_status := 'cancelled'::public.order_status;
    RETURN NEW;
  END IF;
  IF NEW.submitted_at IS NOT NULL AND NEW.order_status = 'draft'::public.order_status THEN
    NEW.order_status := 'confirmed'::public.order_status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER orders_sync_status BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_on_submit();

-- "Someone has looked at this new order" — drives the unopened highlight.
CREATE OR REPLACE FUNCTION public.mark_order_opened(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.orders WHERE id = p_order_id;
  IF v_tenant IS NULL OR NOT public.user_is_staff_for_tenant(v_tenant) THEN RETURN; END IF;
  UPDATE public.orders SET first_opened_at = now(), first_opened_by = auth.uid()
   WHERE id = p_order_id AND first_opened_at IS NULL;
END; $$;

GRANT EXECUTE ON FUNCTION public.sync_order_amounts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollup_order_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_opened(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice_number(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 9. Seed the numbering before the first order.
--    Replace the uuids with GASA's app id and brand owner id.
-- ---------------------------------------------------------------------
-- INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
-- VALUES ('<app-uuid>', 'order', 'GASA', 1000),
--        ('<app-uuid>', 'invoice', 'INV', 1000);
