
-- 1. Order adjustments table for manual line items
CREATE TABLE IF NOT EXISTS public.order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_adjustments_order ON public.order_adjustments(order_id);

ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;

-- Staff can read adjustments on their tenant's orders
CREATE POLICY "order_adjustments_select_staff"
ON public.order_adjustments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_adjustments.order_id
      AND public.user_is_staff_for(o.app_id, o.tenant_id)
  )
);

-- Customers can read adjustments on their own orders (so they see the line items)
CREATE POLICY "order_adjustments_select_customer"
ON public.order_adjustments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_adjustments.order_id
      AND o.ordered_by_profile_id = auth.uid()
  )
);

-- Inserts/updates/deletes go through the order-engine edge function (service role)
-- but we still want a fallback for tenant admins via direct mutation if needed
CREATE POLICY "order_adjustments_write_admin"
ON public.order_adjustments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_adjustments.order_id
      AND public.user_is_tenant_admin(o.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_adjustments.order_id
      AND public.user_is_tenant_admin(o.tenant_id)
  )
);

-- 2. Track which admin prepared an order on behalf of a customer (for future impersonation feature)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS created_by_admin_profile_id uuid REFERENCES public.profiles(id);

-- 3. Extend sync_order_amounts to include adjustments in subtotal
CREATE OR REPLACE FUNCTION public.sync_order_amounts(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jobs_total numeric(12,2);
  v_adjustments_total numeric(12,2);
  v_subtotal numeric(12,2);
BEGIN
  SELECT coalesce(sum(net_price),0)
  INTO v_jobs_total
  FROM public.order_jobs
  WHERE order_id = p_order_id;

  SELECT coalesce(sum(amount),0)
  INTO v_adjustments_total
  FROM public.order_adjustments
  WHERE order_id = p_order_id;

  v_subtotal := v_jobs_total + v_adjustments_total;

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    total_amount = round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2),
    amount_due = round((v_subtotal - discount_amount + delivery_amount + vat_amount) - amount_paid, 2),
    payment_status = CASE
      WHEN amount_paid <= 0 THEN 'unpaid'
      WHEN amount_paid >= round(v_subtotal - discount_amount + delivery_amount + vat_amount, 2) THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$function$;
