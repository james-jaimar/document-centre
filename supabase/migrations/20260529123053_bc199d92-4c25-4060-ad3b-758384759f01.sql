
-- Helper: returns true when the branch has an "active enough" subscription, OR no branch.
CREATE OR REPLACE FUNCTION public.branch_subscription_active(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p_branch_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.branch_subscriptions bs
        WHERE bs.branch_id = p_branch_id
          AND (
            bs.status IN ('active','trialing')
            OR bs.billing_status IN ('paid','free')
          )
      )
    END;
$$;

-- Allow callers to bypass (platform admin or tenant admin for the branch's tenant).
CREATE OR REPLACE FUNCTION public.user_can_bypass_branch_gate(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR (
      p_branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = p_branch_id AND public.user_is_tenant_admin(b.tenant_id)
      )
    );
$$;

-- Restrictive policy on orders INSERT: branch must have active sub, unless bypass.
DROP POLICY IF EXISTS "orders_branch_subscription_gate" ON public.orders;
CREATE POLICY "orders_branch_subscription_gate"
ON public.orders
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  branch_id IS NULL
  OR public.branch_subscription_active(branch_id)
  OR public.user_can_bypass_branch_gate(branch_id)
);
