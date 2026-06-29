
-- Storage policies for email-assets bucket (private). Only platform admins
-- can upload/manage; reads happen via the email-image edge function with
-- service-role, so no public read policy is needed.

CREATE POLICY "Platform admins can upload email assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "Platform admins can read email assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'email-assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "Platform admins can update email assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);

CREATE POLICY "Platform admins can delete email assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND public.has_role(auth.uid(), 'platform_admin'::app_role)
);
