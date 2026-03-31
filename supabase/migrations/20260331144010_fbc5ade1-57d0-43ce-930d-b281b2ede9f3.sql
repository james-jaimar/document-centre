
-- =============================================
-- Phase 1, Migration 2: Enable RLS + Add policies for all new tables
-- =============================================

-- Enable RLS on all new tables
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies
-- =============================================

-- tenant_memberships: users can see their own memberships
CREATE POLICY tenant_memberships_select_own
ON public.tenant_memberships FOR SELECT
USING (profile_id = auth.uid());

-- apps: members can see their apps
CREATE POLICY apps_select_members
ON public.apps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.app_id = apps.id
      AND tm.is_active = true
  )
);

-- suppliers: only staff can see
CREATE POLICY suppliers_select_staff
ON public.suppliers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.profile_id = auth.uid()
    AND tm.is_active = true
    AND tm.role IN ('owner','admin','sales','production','accounts')
));

-- number_sequences: only owner/admin staff
CREATE POLICY sequences_select_staff
ON public.number_sequences FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.profile_id = auth.uid()
    AND tm.app_id = number_sequences.app_id
    AND tm.is_active = true
    AND tm.role IN ('owner','admin')
));

-- orders: use user_can_read_order (new membership-based policies alongside existing ones)
CREATE POLICY orders_select_membership
ON public.orders FOR SELECT
USING (
  app_id IS NOT NULL
  AND public.user_can_read_order(app_id, tenant_id, ordered_by_profile_id)
);

CREATE POLICY orders_update_staff_membership
ON public.orders FOR UPDATE
USING (
  app_id IS NOT NULL
  AND public.user_is_staff_for(app_id, tenant_id)
)
WITH CHECK (
  app_id IS NOT NULL
  AND public.user_is_staff_for(app_id, tenant_id)
);

-- order_jobs
CREATE POLICY order_jobs_select_policy
ON public.order_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_jobs.order_id
      AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);

CREATE POLICY order_jobs_update_staff
ON public.order_jobs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_jobs.order_id
      AND public.user_is_staff_for(o.app_id, o.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_jobs.order_id
      AND public.user_is_staff_for(o.app_id, o.tenant_id)
  )
);

-- order_addresses
CREATE POLICY order_addresses_select_policy
ON public.order_addresses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);

CREATE POLICY order_addresses_update_staff
ON public.order_addresses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND public.user_is_staff_for(o.app_id, o.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND public.user_is_staff_for(o.app_id, o.tenant_id)
  )
);

-- order_pricing_snapshots
CREATE POLICY order_pricing_snapshots_select_policy
ON public.order_pricing_snapshots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_pricing_snapshots.order_id
      AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);

-- payments
CREATE POLICY payments_select_policy
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);

CREATE POLICY payments_update_staff
ON public.payments FOR UPDATE
USING (public.user_is_staff_for(app_id, tenant_id))
WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- order_documents
CREATE POLICY order_documents_select_policy
ON public.order_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_documents.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND order_documents.is_customer_visible = true
        )
      )
  )
);

CREATE POLICY order_documents_update_staff
ON public.order_documents FOR UPDATE
USING (public.user_is_staff_for(app_id, tenant_id))
WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- timeline_events
CREATE POLICY timeline_events_select_policy
ON public.timeline_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = timeline_events.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND timeline_events.visibility IN ('customer','both')
        )
      )
  )
);

CREATE POLICY timeline_events_update_staff
ON public.timeline_events FOR UPDATE
USING (public.user_is_staff_for(app_id, tenant_id))
WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- messages
CREATE POLICY messages_select_policy
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND messages.is_internal = false
        )
      )
  )
);

CREATE POLICY messages_insert_customer_or_staff
ON public.messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR (
          public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
          AND messages.is_internal = false
          AND messages.sender_profile_id = auth.uid()
        )
      )
  )
);

CREATE POLICY messages_update_staff
ON public.messages FOR UPDATE
USING (public.user_is_staff_for(app_id, tenant_id))
WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- job_proofs
CREATE POLICY job_proofs_select_policy
ON public.job_proofs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = job_proofs.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
      )
  )
);

CREATE POLICY job_proofs_update_staff
ON public.job_proofs FOR UPDATE
USING (public.user_is_staff_for(app_id, tenant_id))
WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

-- status_history
CREATE POLICY status_history_select_policy
ON public.status_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = status_history.order_id
      AND (
        public.user_is_staff_for(o.app_id, o.tenant_id)
        OR public.user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
      )
  )
);
