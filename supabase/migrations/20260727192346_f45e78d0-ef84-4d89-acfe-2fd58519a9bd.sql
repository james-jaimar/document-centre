CREATE POLICY "tenants_public_read_active_auth"
ON public.tenants
FOR SELECT
TO authenticated
USING (is_active = true);