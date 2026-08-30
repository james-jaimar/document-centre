CREATE POLICY "Public can read tenant tax settings"
ON public.tenant_settings
FOR SELECT
TO anon, authenticated
USING (
  category = 'financial'
  AND is_sensitive = false
  AND setting_key IN ('tax_enabled', 'tax_rate', 'tax_inclusive', 'tax_label')
);