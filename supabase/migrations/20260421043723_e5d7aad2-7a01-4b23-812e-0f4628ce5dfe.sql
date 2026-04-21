-- ──────────────────────────────────────────────────────────────────────────
-- A. Grant platform_admin parity on order child tables.
--    All child-table SELECT policies route through user_can_read_order()
--    or user_is_staff_for(). Extending those two helpers fixes every
--    affected table at once (order_jobs, order_documents, order_addresses,
--    timeline_events, status_history, messages, payments, job_proofs,
--    order_invoices, order_pricing_snapshots) without touching policies.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_is_staff_for(p_app_id uuid, p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    -- Platform admins are treated as staff for every tenant/app.
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','sales','production','accounts')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_can_read_order(p_app_id uuid, p_tenant_id uuid, p_ordered_by_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    -- Platform admins always.
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    -- Tenant staff (owner/admin/sales/production/accounts).
    OR public.user_is_staff_for(p_app_id, p_tenant_id)
    -- Customer membership: own order or has can_view_all_orders.
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
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- B. Normalize submitted order lifecycle.
--    Submitted orders should not remain order_status='draft'. Backfill
--    historical drift, then enforce going forward via a trigger so the
--    legacy column always reflects whether the order has been placed.
-- ──────────────────────────────────────────────────────────────────────────

-- Backfill: any submitted, non-cancelled order still flagged 'draft' moves to
-- 'confirmed' (a placed-but-not-yet-in-production state per the order_status
-- enum). Cancelled orders stay 'cancelled'.
UPDATE public.orders
SET order_status = 'confirmed'::order_status,
    updated_at = now()
WHERE submitted_at IS NOT NULL
  AND order_status = 'draft'::order_status
  AND admin_status <> 'cancelled';

-- Defensive: any cancelled order should reflect that on order_status too.
UPDATE public.orders
SET order_status = 'cancelled'::order_status,
    updated_at = now()
WHERE admin_status = 'cancelled'
  AND order_status NOT IN ('cancelled'::order_status);

-- Trigger: keep order_status aligned with submission/cancellation going
-- forward. Never overrides cart, only promotes draft → confirmed when the
-- order becomes submitted, and pushes to 'cancelled' when admin_status
-- says so. This stops new "submitted draft" rows being created.
CREATE OR REPLACE FUNCTION public.sync_order_status_on_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Cancellation always wins.
  IF NEW.admin_status = 'cancelled' THEN
    NEW.order_status := 'cancelled'::order_status;
    RETURN NEW;
  END IF;

  -- Submission promotion: only act on the transition into "submitted",
  -- and only if we're still on the legacy draft state. Don't overwrite
  -- richer downstream states (in_production / ready_for_collection / etc).
  IF NEW.submitted_at IS NOT NULL
     AND NEW.order_status = 'draft'::order_status THEN
    NEW.order_status := 'confirmed'::order_status;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_order_status_on_submit ON public.orders;
CREATE TRIGGER trg_sync_order_status_on_submit
  BEFORE INSERT OR UPDATE OF submitted_at, admin_status, order_status
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_status_on_submit();