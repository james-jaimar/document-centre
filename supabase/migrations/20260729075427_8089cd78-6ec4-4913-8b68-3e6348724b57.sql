
-- Drop old policies that unconditionally cast the first path segment to uuid
DROP POLICY IF EXISTS "Tenant admins can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can delete assets" ON storage.objects;

-- Recreate with regex-guarded UUID cast + platform_admin override
CREATE POLICY "Tenant admins can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.user_is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "Tenant admins can update assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.user_is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "Tenant admins can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.user_is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  )
);
