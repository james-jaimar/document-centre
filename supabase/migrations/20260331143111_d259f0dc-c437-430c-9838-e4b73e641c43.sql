
-- =============================================
-- Phase 1, Migration 1: New tables + ALTER existing tables + functions
-- =============================================

-- 1. Create apps table
CREATE TABLE public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ALTER tenants: add app_id (nullable for now), external_ref
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_ref text;

-- 3. ALTER branches: add code, external_ref
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS external_ref text;

-- 4. ALTER profiles: add email, first_name, last_name, phone, global_role, is_active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS global_role text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 5. Create tenant_memberships
CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  role text NOT NULL,
  can_view_all_orders boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_role_check CHECK (role IN ('owner','admin','sales','production','accounts','customer'))
);

CREATE UNIQUE INDEX tenant_memberships_unique_idx
  ON public.tenant_memberships (
    profile_id,
    app_id,
    tenant_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    role
  );

-- 6. Create suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Create number_sequences
CREATE TABLE public.number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  sequence_type text NOT NULL,
  prefix text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  UNIQUE(app_id, sequence_type)
);

-- 8. ALTER orders: add new columns for the order engine
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES public.apps(id),
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS external_order_ref text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS storefront_name text,
  ADD COLUMN IF NOT EXISTS ordered_by_profile_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS admin_status text NOT NULL DEFAULT 'new_order',
  ADD COLUMN IF NOT EXISTS customer_status text NOT NULL DEFAULT 'awaiting_payment',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fulfilment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_code text,
  ADD COLUMN IF NOT EXISTS date_required date,
  ADD COLUMN IF NOT EXISTS turnaround_time_text text,
  ADD COLUMN IF NOT EXISTS notes_internal text,
  ADD COLUMN IF NOT EXISTS notes_customer text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Add CHECK constraints to orders for the new status columns
ALTER TABLE public.orders
  ADD CONSTRAINT orders_admin_status_check CHECK (admin_status IN (
    'new_order','under_review','approved','in_production','qa','ready_for_dispatch','completed','on_hold','cancelled'
  )),
  ADD CONSTRAINT orders_customer_status_check CHECK (customer_status IN (
    'awaiting_payment','in_production','on_hold','proof_pending','ready','completed','cancelled','dispatched'
  )),
  ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
    'unpaid','requested','part_paid','paid','failed','refunded'
  )),
  ADD CONSTRAINT orders_fulfilment_status_check CHECK (fulfilment_status IN (
    'pending','in_production','ready','dispatched','delivered','collected','cancelled'
  ));

-- 9. Create order_jobs
CREATE TABLE public.order_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.branches(id),
  job_number text NOT NULL UNIQUE,
  sequence_no int NOT NULL,
  external_job_ref text,
  external_product_key text,
  product_name text NOT NULL,
  product_category text,
  job_name text,
  job_status text NOT NULL DEFAULT 'new_job',
  customer_job_status text NOT NULL DEFAULT 'in_production',
  proof_status text NOT NULL DEFAULT 'not_required',
  file_status text NOT NULL DEFAULT 'pending',
  supplier_status text,
  urgency text NOT NULL DEFAULT 'normal',
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  unit_label text,
  net_price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 15,
  gross_price numeric(12,2) NOT NULL DEFAULT 0,
  weight_kg numeric(12,3),
  qty_sent numeric(12,2) NOT NULL DEFAULT 0,
  qty_remaining numeric(12,2) NOT NULL DEFAULT 0,
  assigned_to_profile_id uuid REFERENCES auth.users(id),
  assigned_supplier_id uuid REFERENCES public.suppliers(id),
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  production_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  integration_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT order_jobs_status_check CHECK (job_status IN (
    'new_job','awaiting_files','awaiting_proof','proof_ready','proof_approved',
    'approved_for_production','in_production','outsourced','qa','ready','completed',
    'on_hold','cancelled'
  )),
  CONSTRAINT order_jobs_customer_status_check CHECK (customer_job_status IN (
    'awaiting_payment','in_production','on_hold','proof_pending','ready','completed','cancelled'
  )),
  CONSTRAINT order_jobs_proof_status_check CHECK (proof_status IN (
    'not_required','pending','generated','sent','approved','rejected'
  )),
  CONSTRAINT order_jobs_file_status_check CHECK (file_status IN ('pending','uploaded','validated')),
  CONSTRAINT order_jobs_urgency_check CHECK (urgency IN ('low','normal','high','urgent'))
);

-- 10. Create order_addresses
CREATE TABLE public.order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  address_type text NOT NULL,
  company_name text,
  contact_name text,
  line1 text,
  line2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text DEFAULT 'South Africa',
  phone text,
  email text,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_addresses_type_check CHECK (address_type IN ('billing','delivery'))
);

-- 11. Create order_pricing_snapshots
CREATE TABLE public.order_pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version_no int NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_amount numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 15,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Create payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  provider text NOT NULL,
  provider_transaction_id text,
  payment_reference text,
  status text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  initiated_at timestamptz,
  paid_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_check CHECK (provider IN ('payfast','paystack','stripe','eft','manual','other')),
  CONSTRAINT payments_status_check CHECK (status IN ('initiated','pending','paid','failed','cancelled','refunded'))
);

-- 13. Create order_documents (separate from existing documents table used for file processing)
CREATE TABLE public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.branches(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'documents',
  storage_path text NOT NULL,
  public_url text,
  mime_type text,
  file_size_bytes bigint,
  version_no int NOT NULL DEFAULT 1,
  is_customer_visible boolean NOT NULL DEFAULT false,
  source_app_managed boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_documents_type_check CHECK (document_type IN (
    'proforma_invoice','invoice','delivery_note','proof','artwork','job_file','preview','other'
  ))
);

-- 14. Create timeline_events
CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.branches(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'both',
  actor_type text NOT NULL,
  actor_profile_id uuid REFERENCES auth.users(id),
  actor_name text,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timeline_events_visibility_check CHECK (visibility IN ('admin','customer','both')),
  CONSTRAINT timeline_events_actor_type_check CHECK (actor_type IN ('system','admin','customer','integration'))
);

-- 15. Create messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.branches(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  sender_profile_id uuid REFERENCES auth.users(id),
  sender_type text NOT NULL,
  recipient_type text NOT NULL DEFAULT 'thread',
  message_body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_type_check CHECK (sender_type IN ('admin','customer','system')),
  CONSTRAINT messages_recipient_type_check CHECK (recipient_type IN ('thread','customer','admin'))
);

-- 16. Create job_proofs
CREATE TABLE public.job_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  proof_type text NOT NULL,
  proof_status text NOT NULL DEFAULT 'pending',
  viewer_type text NOT NULL,
  viewer_url text,
  document_id uuid REFERENCES public.order_documents(id) ON DELETE SET NULL,
  approval_token text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  CONSTRAINT job_proofs_type_check CHECK (proof_type IN ('pdf','flipbook','external_preview','image','other')),
  CONSTRAINT job_proofs_status_check CHECK (proof_status IN ('pending','generated','sent','approved','rejected')),
  CONSTRAINT job_proofs_viewer_check CHECK (viewer_type IN ('internal_pdf','external_url','flipbook','download_only'))
);

-- 17. Create status_history
CREATE TABLE public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_history_entity_check CHECK (entity_type IN ('order','job','proof','payment'))
);

-- =============================================
-- Functions
-- =============================================

-- set_updated_at (alias for existing update_updated_at_column)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Number sequence functions
CREATE OR REPLACE FUNCTION public.next_number(p_app_id uuid, p_sequence_type text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  UPDATE public.number_sequences
  SET last_value = last_value + 1
  WHERE app_id = p_app_id
    AND sequence_type = p_sequence_type
  RETURNING last_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Missing number sequence for app % and type %', p_app_id, p_sequence_type;
  END IF;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number(p_app_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_num bigint;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.number_sequences
  WHERE app_id = p_app_id
    AND sequence_type = 'order';

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Missing order sequence prefix for app %', p_app_id;
  END IF;

  v_num := public.next_number(p_app_id, 'order');
  RETURN v_prefix || '-' || lpad(v_num::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_job_number(p_order_number text, p_sequence_no int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_order_number || '-' || p_sequence_no::text;
$$;

-- Status mapping functions
CREATE OR REPLACE FUNCTION public.map_customer_job_status(p_job_status text, p_payment_status text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_payment_status = 'unpaid' AND p_job_status = 'new_job' THEN 'awaiting_payment'
    WHEN p_job_status IN ('awaiting_proof','proof_ready') THEN 'proof_pending'
    WHEN p_job_status IN ('new_job','awaiting_files','proof_approved','approved_for_production','in_production','outsourced','qa') THEN 'in_production'
    WHEN p_job_status = 'ready' THEN 'ready'
    WHEN p_job_status = 'completed' THEN 'completed'
    WHEN p_job_status = 'on_hold' THEN 'on_hold'
    WHEN p_job_status = 'cancelled' THEN 'cancelled'
    ELSE 'in_production'
  END;
$$;

CREATE OR REPLACE FUNCTION public.rollup_order_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status text;
  v_any_hold boolean;
  v_all_completed boolean;
  v_all_ready_or_done boolean;
  v_any_proof_pending boolean;
BEGIN
  SELECT payment_status INTO v_payment_status FROM public.orders WHERE id = p_order_id;

  SELECT
    bool_or(job_status = 'on_hold'),
    bool_and(job_status = 'completed'),
    bool_and(job_status IN ('ready','completed')),
    bool_or(job_status IN ('awaiting_proof','proof_ready'))
  INTO
    v_any_hold,
    v_all_completed,
    v_all_ready_or_done,
    v_any_proof_pending
  FROM public.order_jobs
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    customer_status = CASE
      WHEN payment_status = 'unpaid' AND amount_due > 0 THEN 'awaiting_payment'
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready'
      WHEN v_any_proof_pending THEN 'proof_pending'
      ELSE 'in_production'
    END,
    admin_status = CASE
      WHEN v_any_hold THEN 'on_hold'
      WHEN v_all_completed THEN 'completed'
      WHEN v_all_ready_or_done THEN 'ready_for_dispatch'
      ELSE 'in_production'
    END,
    fulfilment_status = CASE
      WHEN v_all_completed THEN 'delivered'
      WHEN v_all_ready_or_done THEN 'ready'
      ELSE 'in_production'
    END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_amounts(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric(12,2);
BEGIN
  SELECT coalesce(sum(net_price),0)
  INTO v_subtotal
  FROM public.order_jobs
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    total_amount = round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2),
    amount_due = round((v_subtotal - discount_amount + delivery_amount + vat_amount) - amount_paid, 2),
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_order_jobs_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_jobs
  SET
    qty_remaining = greatest(quantity - qty_sent, 0),
    customer_job_status = public.map_customer_job_status(job_status, (SELECT payment_status FROM public.orders WHERE id = order_id)),
    updated_at = now()
  WHERE id = coalesce(NEW.id, OLD.id);

  PERFORM public.sync_order_amounts(coalesce(NEW.order_id, OLD.order_id));
  PERFORM public.rollup_order_status(coalesce(NEW.order_id, OLD.order_id));
  RETURN NULL;
END;
$$;

-- Membership security functions
CREATE OR REPLACE FUNCTION public.user_has_membership(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.app_id = p_app_id
      AND tm.tenant_id = p_tenant_id
      AND tm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_staff_for(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.app_id = p_app_id
      AND tm.tenant_id = p_tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin','sales','production','accounts')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_order(p_app_id uuid, p_tenant_id uuid, p_ordered_by_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.user_is_staff_for(p_app_id, p_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role = 'customer'
        AND (
          p_ordered_by_profile_id = auth.uid()
          OR tm.can_view_all_orders = true
        )
    )
  );
$$;

-- =============================================
-- Triggers
-- =============================================

CREATE TRIGGER trg_orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_order_jobs_updated_at
BEFORE UPDATE ON public.order_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_order_jobs_after_ins
AFTER INSERT ON public.order_jobs
FOR EACH ROW EXECUTE FUNCTION public.handle_order_jobs_after_write();

CREATE TRIGGER trg_order_jobs_after_upd
AFTER UPDATE OF net_price, qty_sent, quantity, job_status ON public.order_jobs
FOR EACH ROW EXECUTE FUNCTION public.handle_order_jobs_after_write();

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_orders_app_tenant ON public.orders(app_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_ordered_by ON public.orders(ordered_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_statuses ON public.orders(admin_status, customer_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

CREATE INDEX idx_order_jobs_order_id ON public.order_jobs(order_id);
CREATE INDEX idx_order_jobs_status ON public.order_jobs(job_status, customer_job_status);
CREATE INDEX idx_order_jobs_product ON public.order_jobs(product_name);
CREATE INDEX idx_order_jobs_job_number ON public.order_jobs(job_number);

CREATE INDEX idx_timeline_order_id ON public.timeline_events(order_id, created_at DESC);
CREATE INDEX idx_timeline_job_id ON public.timeline_events(job_id, created_at DESC);

CREATE INDEX idx_order_documents_order_id ON public.order_documents(order_id);
CREATE INDEX idx_order_documents_job_id ON public.order_documents(job_id);
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_messages_order_id ON public.messages(order_id, created_at DESC);
CREATE INDEX idx_order_jobs_configuration_gin ON public.order_jobs USING gin(configuration);
CREATE INDEX idx_order_jobs_snapshot_gin ON public.order_jobs USING gin(product_snapshot);
