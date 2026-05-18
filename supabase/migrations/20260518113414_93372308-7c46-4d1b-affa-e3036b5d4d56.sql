
-- Phase 3: path-based ownership for documents, document-uploads, assets buckets

-- Drop overly broad existing policies
DROP POLICY IF EXISTS "Authenticated users can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;

-- ============================================================
-- documents bucket: invoices/{tenant_id}/...
-- Tenant members + platform admin can read; platform admin only writes.
-- ============================================================
CREATE POLICY "documents_invoices_tenant_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR (
      (storage.foldername(name))[1] = 'invoices'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.profile_id = auth.uid()
          AND tm.is_active = true
          AND tm.tenant_id = ((storage.foldername(name))[2])::uuid
      )
    )
  )
);

CREATE POLICY "documents_admin_write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "documents_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "documents_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

-- ============================================================
-- document-uploads bucket: enforce {user_id}/... path scheme
-- ============================================================
CREATE POLICY "document_uploads_owner_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-uploads'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

CREATE POLICY "document_uploads_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-uploads'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

CREATE POLICY "document_uploads_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-uploads'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

CREATE POLICY "document_uploads_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-uploads'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

-- ============================================================
-- assets bucket: public read stays, writes restricted to platform admin
-- ============================================================
CREATE POLICY "assets_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "assets_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "assets_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);
