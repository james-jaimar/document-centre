CREATE OR REPLACE FUNCTION public.user_can_insert_order_item_for_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.app_id IS NOT NULL
      AND public.user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
  );
$$;

DROP POLICY IF EXISTS order_items_insert_staff_membership ON public.order_items;

CREATE POLICY order_items_insert_staff_membership
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_insert_order_item_for_order(order_id));