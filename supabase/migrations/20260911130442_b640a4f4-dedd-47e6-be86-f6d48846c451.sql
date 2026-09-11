CREATE POLICY "Tenant admins can upload own email assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT tm.tenant_id::text
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Tenant admins can read own email assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT tm.tenant_id::text
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Tenant admins can update own email assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT tm.tenant_id::text
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT tm.tenant_id::text
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Tenant admins can delete own email assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT tm.tenant_id::text
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner', 'admin')
  )
);