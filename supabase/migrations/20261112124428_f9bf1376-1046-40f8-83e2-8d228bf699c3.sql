-- Tenant product toggles: storefront visitors only see their own storefront's toggles
DROP POLICY IF EXISTS "tpt_public_read" ON public.tenant_product_toggles;
CREATE POLICY "tpt_storefront_read" ON public.tenant_product_toggles
  FOR SELECT TO anon
  USING (tenant_id = public.current_storefront_tenant_id());

-- Delivery method overrides: storefront tenant or tenant members only
DROP POLICY IF EXISTS "Anyone can read method overrides" ON public.tenant_delivery_method_overrides;
CREATE POLICY "Storefront or members read method overrides" ON public.tenant_delivery_method_overrides
  FOR SELECT TO anon, authenticated
  USING (
    tenant_id = public.current_storefront_tenant_id()
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.profile_id = auth.uid() AND tm.is_active = true
                 AND tm.tenant_id = tenant_delivery_method_overrides.tenant_id)
  );

-- Imposition defaults: staff only (not customers / guests)
DROP POLICY IF EXISTS "pid_read_authenticated" ON public.product_imposition_defaults;
CREATE POLICY "pid_read_staff" ON public.product_imposition_defaults
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.profile_id = auth.uid() AND tm.is_active = true
                 AND tm.role <> 'customer')
  );

-- Contact form: public submissions allowed, but only well-formed new rows
DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(name)) BETWEEN 1 AND 200
    AND length(email) BETWEEN 3 AND 320 AND email LIKE '%@%'
    AND length(trim(message)) BETWEEN 1 AND 10000
    AND handled_by_profile_id IS NULL
    AND handled_at IS NULL
  );