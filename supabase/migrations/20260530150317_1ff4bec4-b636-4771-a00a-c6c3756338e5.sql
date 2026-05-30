
-- 1) New 4-arg overload of user_can_read_order that includes branch-staff access
CREATE OR REPLACE FUNCTION public.user_can_read_order(
  p_app_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_ordered_by_profile_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_staff_for(p_app_id, p_tenant_id)
    OR public.user_is_staff_for_branch(p_app_id, p_tenant_id, p_branch_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role = 'customer'
        AND (p_ordered_by_profile_id = auth.uid() OR tm.can_view_all_orders = true)
    )
  );
$$;

-- 2) Recreate the 5 affected SELECT policies to pass branch_id

-- orders
DROP POLICY IF EXISTS orders_select_membership ON public.orders;
CREATE POLICY orders_select_membership ON public.orders
FOR SELECT TO authenticated
USING (app_id IS NOT NULL AND public.user_can_read_order(app_id, tenant_id, branch_id, ordered_by_profile_id));

-- order_jobs
DROP POLICY IF EXISTS order_jobs_select_policy ON public.order_jobs;
CREATE POLICY order_jobs_select_policy ON public.order_jobs
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_jobs.order_id
    AND public.user_can_read_order(o.app_id, o.tenant_id, o.branch_id, o.ordered_by_profile_id)
));

-- order_addresses
DROP POLICY IF EXISTS order_addresses_select_policy ON public.order_addresses;
CREATE POLICY order_addresses_select_policy ON public.order_addresses
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_addresses.order_id
    AND public.user_can_read_order(o.app_id, o.tenant_id, o.branch_id, o.ordered_by_profile_id)
));

-- order_pricing_snapshots
DROP POLICY IF EXISTS order_pricing_snapshots_select_policy ON public.order_pricing_snapshots;
CREATE POLICY order_pricing_snapshots_select_policy ON public.order_pricing_snapshots
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_pricing_snapshots.order_id
    AND public.user_can_read_order(o.app_id, o.tenant_id, o.branch_id, o.ordered_by_profile_id)
));

-- payments
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
CREATE POLICY payments_select_policy ON public.payments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = payments.order_id
    AND public.user_can_read_order(o.app_id, o.tenant_id, o.branch_id, o.ordered_by_profile_id)
));
