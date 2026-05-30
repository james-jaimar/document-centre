-- ============================================================
-- BRANCH PERMISSION LOCKDOWN
-- 
-- Splits user_is_staff_for into:
--   user_is_staff_for(app_id, tenant_id)             — TENANT-WIDE staff only
--   user_is_staff_for_branch(app_id, tenant_id, branch_id) — branch-aware
--
-- Then rewrites every RLS policy that touches branch-scoped data
-- (orders/jobs/messages/etc) to use the branch-aware variant so
-- branch_manager / store_operator cannot read or write rows from
-- other branches within the same tenant.
-- ============================================================

-- 1. Redefine tenant-wide helper to exclude branch-only roles
CREATE OR REPLACE FUNCTION public.user_is_staff_for(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.branch_id IS NULL
        AND tm.role IN ('owner','admin','sales','production','accounts')
    )
  );
$$;

-- 2. Branch-aware helper
CREATE OR REPLACE FUNCTION public.user_is_staff_for_branch(
  p_app_id uuid, p_tenant_id uuid, p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','sales','production','accounts',
                        'branch_manager','store_operator')
        AND (
          tm.branch_id IS NULL
          OR (p_branch_id IS NOT NULL AND tm.branch_id = p_branch_id)
        )
    )
  );
$$;

-- =====================================================================
-- ORDERS (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS orders_update_staff_membership ON public.orders;
CREATE POLICY orders_update_staff_membership ON public.orders
  FOR UPDATE TO authenticated
  USING (app_id IS NOT NULL AND public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (app_id IS NOT NULL AND public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

-- =====================================================================
-- ORDER_JOBS (no branch_id; join orders)
-- =====================================================================
DROP POLICY IF EXISTS order_jobs_update_staff ON public.order_jobs;
CREATE POLICY order_jobs_update_staff ON public.order_jobs
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_jobs.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_jobs.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

-- =====================================================================
-- ORDER_DOCUMENTS (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS order_documents_update_staff ON public.order_documents;
CREATE POLICY order_documents_update_staff ON public.order_documents
  FOR UPDATE TO authenticated
  USING (public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

DROP POLICY IF EXISTS order_documents_select_policy ON public.order_documents;
CREATE POLICY order_documents_select_policy ON public.order_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_documents.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR (public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id) AND order_documents.is_customer_visible = true)
      )
  ));

-- =====================================================================
-- ORDER_ADDRESSES, ORDER_ADJUSTMENTS, ORDER_INVOICES, JOB_PROOFS,
-- STATUS_HISTORY, PAYMENTS (no branch_id; join orders)
-- =====================================================================
DROP POLICY IF EXISTS order_addresses_update_staff ON public.order_addresses;
CREATE POLICY order_addresses_update_staff ON public.order_addresses
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

DROP POLICY IF EXISTS order_adjustments_select_staff ON public.order_adjustments;
CREATE POLICY order_adjustments_select_staff ON public.order_adjustments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_adjustments.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

DROP POLICY IF EXISTS order_invoices_select_policy ON public.order_invoices;
CREATE POLICY order_invoices_select_policy ON public.order_invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_invoices.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
      )
  ));

DROP POLICY IF EXISTS job_proofs_select_policy ON public.job_proofs;
CREATE POLICY job_proofs_select_policy ON public.job_proofs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = job_proofs.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
      )
  ));

DROP POLICY IF EXISTS job_proofs_update_staff ON public.job_proofs;
CREATE POLICY job_proofs_update_staff ON public.job_proofs
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = job_proofs.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = job_proofs.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

DROP POLICY IF EXISTS status_history_select_policy ON public.status_history;
CREATE POLICY status_history_select_policy ON public.status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = status_history.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
      )
  ));

DROP POLICY IF EXISTS payments_update_staff ON public.payments;
CREATE POLICY payments_update_staff ON public.payments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

-- =====================================================================
-- ORDER_PAYMENT_ATTEMPTS (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS opa_select_policy ON public.order_payment_attempts;
CREATE POLICY opa_select_policy ON public.order_payment_attempts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_staff_for_branch(app_id, tenant_id, branch_id)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payment_attempts.order_id
        AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
    )
  );

-- =====================================================================
-- MESSAGES (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS messages_insert_customer_or_staff ON public.messages;
CREATE POLICY messages_insert_customer_or_staff ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND messages.is_internal = false
          AND messages.sender_profile_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS messages_select_policy ON public.messages;
CREATE POLICY messages_select_policy ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR (public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id) AND messages.is_internal = false)
      )
  ));

DROP POLICY IF EXISTS messages_update_staff ON public.messages;
CREATE POLICY messages_update_staff ON public.messages
  FOR UPDATE TO authenticated
  USING (public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

-- =====================================================================
-- TIMELINE_EVENTS (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS timeline_events_select_policy ON public.timeline_events;
CREATE POLICY timeline_events_select_policy ON public.timeline_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = timeline_events.order_id
      AND (
        public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND timeline_events.visibility = ANY (ARRAY['customer'::text, 'both'::text])
        )
      )
  ));

DROP POLICY IF EXISTS timeline_events_select_staff ON public.timeline_events;
CREATE POLICY timeline_events_select_staff ON public.timeline_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = timeline_events.order_id
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  ));

DROP POLICY IF EXISTS timeline_events_update_staff ON public.timeline_events;
CREATE POLICY timeline_events_update_staff ON public.timeline_events
  FOR UPDATE TO authenticated
  USING (public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

-- =====================================================================
-- QUOTES (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS quotes_insert ON public.quotes;
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_staff_for_branch(app_id, tenant_id, branch_id)
    OR (
      customer_profile_id = auth.uid()
      AND public.user_has_membership(app_id, tenant_id)
      AND tenant_id = COALESCE(public.current_storefront_tenant_id(), tenant_id)
    )
  );

DROP POLICY IF EXISTS quote_items_all ON public.quote_items;
CREATE POLICY quote_items_all ON public.quote_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ));

DROP POLICY IF EXISTS quote_documents_all ON public.quote_documents;
CREATE POLICY quote_documents_all ON public.quote_documents
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_documents.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_documents.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ));

DROP POLICY IF EXISTS quote_revisions_select ON public.quote_revisions;
CREATE POLICY quote_revisions_select ON public.quote_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_revisions.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ));

DROP POLICY IF EXISTS quote_revisions_insert ON public.quote_revisions;
CREATE POLICY quote_revisions_insert ON public.quote_revisions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_revisions.quote_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for_branch(q.app_id, q.tenant_id, q.branch_id)
        OR q.customer_profile_id = auth.uid()
      )
  ));

-- =====================================================================
-- EMAIL_OUTBOX (row has branch_id)
-- =====================================================================
DROP POLICY IF EXISTS email_outbox_select_staff ON public.email_outbox;
CREATE POLICY email_outbox_select_staff ON public.email_outbox
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND app_id IS NOT NULL
    AND public.user_is_staff_for_branch(app_id, tenant_id, branch_id)
  );

-- =====================================================================
-- CUSTOMER_CREDIT_ACCOUNTS (row has branch_id; nullable for tenant-wide)
-- =====================================================================
DROP POLICY IF EXISTS credit_accounts_staff_all ON public.customer_credit_accounts;
CREATE POLICY credit_accounts_staff_all ON public.customer_credit_accounts
  FOR ALL TO authenticated
  USING (public.user_is_staff_for_branch(app_id, tenant_id, branch_id))
  WITH CHECK (public.user_is_staff_for_branch(app_id, tenant_id, branch_id));

-- Note: customer_addresses, customer_notes, customer_tags, upload_sessions
-- remain on user_is_staff_for(app_id, tenant_id) — these are tenant-wide
-- resources without a branch_id column. Branch-only roles (branch_manager,
-- store_operator) intentionally lose access; if they need tenant-wide
-- customer visibility, grant them a tenant-wide sales/admin membership.