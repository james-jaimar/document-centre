CREATE POLICY public_storefront_pages_read
ON public.tenant_settings
FOR SELECT
TO anon, authenticated
USING (category = 'storefront' AND is_sensitive = false);