
-- Drop the recursive policies
DROP POLICY IF EXISTS "tenant_memberships_select_staff" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_insert_staff" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_update_staff" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_delete_staff" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_all_platform_admin" ON public.tenant_memberships;

-- Security definer function to check if user is owner/admin for a given app+tenant
CREATE OR REPLACE FUNCTION public.user_is_member_admin(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = auth.uid()
      AND app_id = p_app_id
      AND tenant_id = p_tenant_id
      AND is_active = true
      AND role IN ('owner','admin')
  );
$$;

-- Recreate policies using the safe function
CREATE POLICY "tenant_memberships_select_staff"
ON public.tenant_memberships FOR SELECT TO authenticated
USING (public.user_is_member_admin(app_id, tenant_id));

CREATE POLICY "tenant_memberships_insert_staff"
ON public.tenant_memberships FOR INSERT TO authenticated
WITH CHECK (public.user_is_member_admin(app_id, tenant_id));

CREATE POLICY "tenant_memberships_update_staff"
ON public.tenant_memberships FOR UPDATE TO authenticated
USING (public.user_is_member_admin(app_id, tenant_id))
WITH CHECK (public.user_is_member_admin(app_id, tenant_id));

CREATE POLICY "tenant_memberships_delete_staff"
ON public.tenant_memberships FOR DELETE TO authenticated
USING (public.user_is_member_admin(app_id, tenant_id));

CREATE POLICY "tenant_memberships_all_platform_admin"
ON public.tenant_memberships FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
