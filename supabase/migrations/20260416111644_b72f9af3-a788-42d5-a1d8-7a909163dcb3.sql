-- Allow public (anon) read of non-sensitive branding settings
CREATE POLICY "public_branding_read"
ON public.tenant_settings
FOR SELECT
TO anon, authenticated
USING (
  category = 'branding'
  AND is_sensitive = false
);
