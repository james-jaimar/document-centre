ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS supports_editable_artwork boolean NOT NULL DEFAULT false;

UPDATE public.product_families
SET supports_editable_artwork = true
WHERE id = '5195738a-d548-4b49-bac9-7e8cc8fdfc3d';

DROP POLICY IF EXISTS artwork_placeholders_read ON public.artwork_template_placeholders;

CREATE POLICY artwork_placeholders_read
ON public.artwork_template_placeholders
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.artwork_templates t
    WHERE t.id = artwork_template_placeholders.template_id
      AND t.is_active = true
      AND (
        (
          t.status = 'published'
          AND t.scope_type = 'master'::public.rate_card_scope
        )
        OR (
          t.status = 'published'
          AND t.tenant_id IS NOT NULL
          AND public.current_storefront_tenant_id() IS NOT NULL
          AND t.tenant_id = public.current_storefront_tenant_id()
        )
        OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
        OR (
          t.tenant_id IS NOT NULL
          AND public.user_is_tenant_admin(t.tenant_id)
        )
        OR (
          t.tenant_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.tenant_id = t.tenant_id
              AND tm.is_active = true
          )
        )
      )
  )
);