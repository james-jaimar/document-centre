-- Allow staff to view all timeline events for their tenant's orders
CREATE POLICY "timeline_events_select_staff"
ON public.timeline_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = timeline_events.order_id
      AND user_is_staff_for(o.app_id, o.tenant_id)
  )
);

-- Allow customers to view non-internal timeline events for orders they can read
CREATE POLICY "timeline_events_select_customer"
ON public.timeline_events
FOR SELECT
USING (
  timeline_events.visibility IN ('both', 'customer')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = timeline_events.order_id
      AND user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id)
  )
);