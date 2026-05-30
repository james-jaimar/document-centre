-- Track read state for messages so we can show unread badges on both
-- customer & staff sides, mirroring the Printjob behaviour.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_by_customer_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_by_staff_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_order_read_customer
  ON public.messages (order_id, read_by_customer_at)
  WHERE is_internal = false;

CREATE INDEX IF NOT EXISTS idx_messages_order_read_staff
  ON public.messages (order_id, read_by_staff_at);

-- RPC: per-order unread counts for the current customer
CREATE OR REPLACE FUNCTION public.get_unread_message_counts_for_customer()
RETURNS TABLE(order_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.order_id, count(*)::bigint
  FROM public.messages m
  JOIN public.orders o ON o.id = m.order_id
  WHERE m.is_internal = false
    AND m.sender_type <> 'customer'
    AND m.read_by_customer_at IS NULL
    AND o.user_id = auth.uid()
  GROUP BY m.order_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_message_counts_for_customer() TO authenticated;

-- RPC: per-order unread counts for staff (any non-customer message-recipient
-- for orders the staff member can see). We scope by tenant membership.
CREATE OR REPLACE FUNCTION public.get_unread_message_counts_for_staff(p_tenant_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.order_id, count(*)::bigint
  FROM public.messages m
  WHERE m.sender_type = 'customer'
    AND m.read_by_staff_at IS NULL
    AND m.tenant_id = p_tenant_id
    AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
  GROUP BY m.order_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_message_counts_for_staff(uuid, uuid) TO authenticated;

-- Mark-read helpers
CREATE OR REPLACE FUNCTION public.mark_order_messages_read_customer(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
  SET read_by_customer_at = now()
  WHERE order_id = p_order_id
    AND is_internal = false
    AND sender_type <> 'customer'
    AND read_by_customer_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = p_order_id AND o.user_id = auth.uid()
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_order_messages_read_customer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_order_messages_read_staff(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
  SET read_by_staff_at = now()
  WHERE order_id = p_order_id
    AND sender_type = 'customer'
    AND read_by_staff_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_order_messages_read_staff(uuid) TO authenticated;

-- Enable realtime on messages so the customer & staff order pages can
-- subscribe and refresh badges without a hard reload.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;