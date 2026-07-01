
-- 1. New columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_production_branch_id_idx
  ON public.orders (production_branch_id) WHERE production_branch_id IS NOT NULL;

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS is_primary_branch boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_one_primary_per_user
  ON public.tenant_memberships (profile_id)
  WHERE is_primary_branch = true;

-- 2. Extend RLS helpers to include production_branch_id access
CREATE OR REPLACE FUNCTION public.user_can_read_order(p_app_id uuid, p_tenant_id uuid, p_branch_id uuid, p_ordered_by_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Order production access: caller is staff at either the customer-facing OR the production branch.
CREATE OR REPLACE FUNCTION public.user_can_access_order_production(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        public.has_role(auth.uid(), 'platform_admin'::app_role)
        OR public.user_is_staff_for(o.app_id, o.tenant_id)
        OR public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
        OR (
          o.production_branch_id IS NOT NULL
          AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.production_branch_id)
        )
      )
  );
$function$;

-- Add SELECT policy for orders when the caller is staff of the production branch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='orders'
      AND policyname='orders_production_branch_read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY orders_production_branch_read ON public.orders
      FOR SELECT TO authenticated
      USING (
        production_branch_id IS NOT NULL
        AND public.user_is_staff_for_branch(app_id, tenant_id, production_branch_id)
      )
    $p$;
  END IF;
END$$;

-- Order jobs: production branch staff can read/update jobs on transferred orders.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='order_jobs'
      AND policyname='order_jobs_production_branch_rw'
  ) THEN
    EXECUTE $p$
      CREATE POLICY order_jobs_production_branch_rw ON public.order_jobs
      FOR ALL TO authenticated
      USING (public.user_can_access_order_production(order_id))
      WITH CHECK (public.user_can_access_order_production(order_id))
    $p$;
  END IF;
END$$;
