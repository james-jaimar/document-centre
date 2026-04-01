CREATE POLICY "order_addresses_insert_owner"
ON public.order_addresses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_addresses.order_id
      AND o.user_id = auth.uid()
  )
);