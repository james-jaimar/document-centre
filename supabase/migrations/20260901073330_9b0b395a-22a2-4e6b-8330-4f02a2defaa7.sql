DROP POLICY IF EXISTS artwork_templates_read ON public.artwork_templates;
CREATE POLICY artwork_templates_read ON public.artwork_templates
FOR SELECT
USING (
  is_active = true
  AND (
    (status = 'published' AND scope_type = 'master'::rate_card_scope)
    OR (scope_type = 'master'::rate_card_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
    OR (
      status = 'published'
      AND tenant_id IS NOT NULL
      AND current_storefront_tenant_id() IS NOT NULL
      AND tenant_id = current_storefront_tenant_id()
    )
    OR (tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
    OR (
      tenant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM tenant_memberships tm
        WHERE tm.profile_id = auth.uid()
          AND tm.tenant_id = artwork_templates.tenant_id
          AND tm.is_active = true
      )
    )
  )
);

DROP POLICY IF EXISTS artwork_placeholders_read ON public.artwork_template_placeholders;
CREATE POLICY artwork_placeholders_read ON public.artwork_template_placeholders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM artwork_templates t
    WHERE t.id = artwork_template_placeholders.template_id
      AND t.is_active = true
      AND (
        (t.status = 'published' AND t.scope_type = 'master'::rate_card_scope)
        OR (t.scope_type = 'master'::rate_card_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
        OR (
          t.status = 'published'
          AND t.tenant_id IS NOT NULL
          AND current_storefront_tenant_id() IS NOT NULL
          AND t.tenant_id = current_storefront_tenant_id()
        )
        OR (t.tenant_id IS NOT NULL AND user_is_tenant_admin(t.tenant_id))
        OR (
          t.tenant_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.tenant_id = t.tenant_id
              AND tm.is_active = true
          )
        )
      )
  )
);