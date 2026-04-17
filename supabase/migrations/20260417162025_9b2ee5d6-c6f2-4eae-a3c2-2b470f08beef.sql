CREATE POLICY "Tenant staff can update customer profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_memberships staff
    JOIN public.tenant_memberships customer
      ON customer.tenant_id = staff.tenant_id
     AND customer.app_id = staff.app_id
    WHERE staff.profile_id = auth.uid()
      AND staff.is_active = true
      AND staff.role IN ('owner','admin','sales','accounts')
      AND customer.profile_id = profiles.id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tenant_memberships staff
    JOIN public.tenant_memberships customer
      ON customer.tenant_id = staff.tenant_id
     AND customer.app_id = staff.app_id
    WHERE staff.profile_id = auth.uid()
      AND staff.is_active = true
      AND staff.role IN ('owner','admin','sales','accounts')
      AND customer.profile_id = profiles.id
  )
);