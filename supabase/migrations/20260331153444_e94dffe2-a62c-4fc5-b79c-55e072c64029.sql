
-- =============================================
-- RLS policies for tenant_memberships CRUD
-- =============================================

-- Staff (owner/admin) within a tenant can view all memberships for their tenant
CREATE POLICY "tenant_memberships_select_staff"
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm2
    WHERE tm2.profile_id = auth.uid()
      AND tm2.app_id = tenant_memberships.app_id
      AND tm2.tenant_id = tenant_memberships.tenant_id
      AND tm2.is_active = true
      AND tm2.role IN ('owner','admin')
  )
);

-- Staff (owner/admin) can invite (insert) memberships
CREATE POLICY "tenant_memberships_insert_staff"
ON public.tenant_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm2
    WHERE tm2.profile_id = auth.uid()
      AND tm2.app_id = tenant_memberships.app_id
      AND tm2.tenant_id = tenant_memberships.tenant_id
      AND tm2.is_active = true
      AND tm2.role IN ('owner','admin')
  )
);

-- Staff (owner/admin) can update memberships
CREATE POLICY "tenant_memberships_update_staff"
ON public.tenant_memberships
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm2
    WHERE tm2.profile_id = auth.uid()
      AND tm2.app_id = tenant_memberships.app_id
      AND tm2.tenant_id = tenant_memberships.tenant_id
      AND tm2.is_active = true
      AND tm2.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm2
    WHERE tm2.profile_id = auth.uid()
      AND tm2.app_id = tenant_memberships.app_id
      AND tm2.tenant_id = tenant_memberships.tenant_id
      AND tm2.is_active = true
      AND tm2.role IN ('owner','admin')
  )
);

-- Staff (owner/admin) can delete memberships
CREATE POLICY "tenant_memberships_delete_staff"
ON public.tenant_memberships
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm2
    WHERE tm2.profile_id = auth.uid()
      AND tm2.app_id = tenant_memberships.app_id
      AND tm2.tenant_id = tenant_memberships.tenant_id
      AND tm2.is_active = true
      AND tm2.role IN ('owner','admin')
  )
);

-- Platform admins can manage all memberships
CREATE POLICY "tenant_memberships_all_platform_admin"
ON public.tenant_memberships
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- =============================================
-- Tenants: allow tenant owner/admin to view & update own tenant
-- =============================================
CREATE POLICY "tenants_select_membership"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = tenants.id
      AND tm.is_active = true
  )
);

CREATE POLICY "tenants_update_owner"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = tenants.id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = tenants.id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
);

-- =============================================
-- Branches: allow tenant membership staff to view branches
-- =============================================
CREATE POLICY "branches_select_membership"
ON public.branches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branches.tenant_id
      AND tm.is_active = true
  )
);

CREATE POLICY "branches_insert_owner_admin"
ON public.branches
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branches.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
);

CREATE POLICY "branches_update_owner_admin"
ON public.branches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branches.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branches.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
);

CREATE POLICY "branches_delete_owner_admin"
ON public.branches
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = branches.tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  )
);

-- =============================================
-- Profiles: allow tenant staff to view profiles within their tenant
-- =============================================
CREATE POLICY "profiles_select_by_membership"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.is_active = true
      AND tm.role IN ('owner','admin','sales','production','accounts')
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm2
        WHERE tm2.profile_id = profiles.id
          AND tm2.tenant_id = tm.tenant_id
          AND tm2.app_id = tm.app_id
      )
  )
);

-- =============================================
-- Security definer helper: check if user is owner/admin in a tenant (avoids RLS recursion on tenant_memberships)
-- =============================================
CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = p_tenant_id
      AND tm.is_active = true
      AND tm.role IN ('owner','admin')
  );
$$;
