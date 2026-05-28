
-- delivery_zones
DROP POLICY IF EXISTS "Tenant admins manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Manage delivery zones"
ON public.delivery_zones
FOR ALL
USING (
  (scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
  OR (scope_type = 'tenant'::delivery_scope AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
  OR (scope_type = 'branch'::delivery_scope AND branch_id IS NOT NULL AND (
        user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.is_active = true
            AND tm.tenant_id = delivery_zones.tenant_id
            AND tm.branch_id = delivery_zones.branch_id
            AND tm.role IN ('owner','admin','branch_manager','store_operator')
        )
      ))
)
WITH CHECK (
  (scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
  OR (scope_type = 'tenant'::delivery_scope AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
  OR (scope_type = 'branch'::delivery_scope AND branch_id IS NOT NULL AND (
        user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.is_active = true
            AND tm.tenant_id = delivery_zones.tenant_id
            AND tm.branch_id = delivery_zones.branch_id
            AND tm.role IN ('owner','admin','branch_manager','store_operator')
        )
      ))
);

-- delivery_rates
DROP POLICY IF EXISTS "Tenant admins manage delivery rates" ON public.delivery_rates;
CREATE POLICY "Manage delivery rates"
ON public.delivery_rates
FOR ALL
USING (
  (scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
  OR (scope_type = 'tenant'::delivery_scope AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
  OR (scope_type = 'branch'::delivery_scope AND branch_id IS NOT NULL AND (
        user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.is_active = true
            AND tm.tenant_id = delivery_rates.tenant_id
            AND tm.branch_id = delivery_rates.branch_id
            AND tm.role IN ('owner','admin','branch_manager','store_operator')
        )
      ))
)
WITH CHECK (
  (scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
  OR (scope_type = 'tenant'::delivery_scope AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
  OR (scope_type = 'branch'::delivery_scope AND branch_id IS NOT NULL AND (
        user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.is_active = true
            AND tm.tenant_id = delivery_rates.tenant_id
            AND tm.branch_id = delivery_rates.branch_id
            AND tm.role IN ('owner','admin','branch_manager','store_operator')
        )
      ))
);

-- delivery_zone_locations (mirror via parent zone)
DROP POLICY IF EXISTS "Tenant admins manage zone locations" ON public.delivery_zone_locations;
CREATE POLICY "Manage zone locations"
ON public.delivery_zone_locations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.delivery_zones z
    WHERE z.id = delivery_zone_locations.zone_id
      AND (
        (z.scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
        OR (z.scope_type = 'tenant'::delivery_scope AND z.tenant_id IS NOT NULL AND user_is_tenant_admin(z.tenant_id))
        OR (z.scope_type = 'branch'::delivery_scope AND z.branch_id IS NOT NULL AND (
              user_is_tenant_admin(z.tenant_id)
              OR EXISTS (
                SELECT 1 FROM public.tenant_memberships tm
                WHERE tm.profile_id = auth.uid()
                  AND tm.is_active = true
                  AND tm.tenant_id = z.tenant_id
                  AND tm.branch_id = z.branch_id
                  AND tm.role IN ('owner','admin','branch_manager','store_operator')
              )
            ))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.delivery_zones z
    WHERE z.id = delivery_zone_locations.zone_id
      AND (
        (z.scope_type = 'platform'::delivery_scope AND has_role(auth.uid(), 'platform_admin'::app_role))
        OR (z.scope_type = 'tenant'::delivery_scope AND z.tenant_id IS NOT NULL AND user_is_tenant_admin(z.tenant_id))
        OR (z.scope_type = 'branch'::delivery_scope AND z.branch_id IS NOT NULL AND (
              user_is_tenant_admin(z.tenant_id)
              OR EXISTS (
                SELECT 1 FROM public.tenant_memberships tm
                WHERE tm.profile_id = auth.uid()
                  AND tm.is_active = true
                  AND tm.tenant_id = z.tenant_id
                  AND tm.branch_id = z.branch_id
                  AND tm.role IN ('owner','admin','branch_manager','store_operator')
              )
            ))
      )
  )
);
