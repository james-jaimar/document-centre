
-- Create a public bucket for tenant branding assets (logos, hero images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view tenant assets (public bucket)
CREATE POLICY "Tenant assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-assets');

-- Authenticated users can upload to their tenant's folder
-- Folder structure: tenant-assets/{tenant_id}/logo.png etc.
CREATE POLICY "Tenant admins can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND public.user_is_tenant_admin((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Tenant admins can update assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.user_is_tenant_admin((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Tenant admins can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.user_is_tenant_admin((storage.foldername(name))[1]::uuid)
);
