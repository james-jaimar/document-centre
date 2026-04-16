
-- 1. Update handle_new_user to auto-create tenant_membership for storefront signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
  v_tenant record;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');

  -- Create default customer role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  -- If signed up via a storefront, create tenant_membership
  v_slug := NEW.raw_user_meta_data ->> 'tenant_slug';
  IF v_slug IS NOT NULL THEN
    SELECT id, app_id INTO v_tenant
    FROM public.tenants
    WHERE slug = v_slug AND is_active = true
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
      INSERT INTO public.tenant_memberships (profile_id, tenant_id, app_id, role)
      VALUES (NEW.id, v_tenant.id, v_tenant.app_id, 'customer');

      -- Set profiles.tenant_id for backwards compatibility
      UPDATE public.profiles SET tenant_id = v_tenant.id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Helper: get user's branch_id from their active membership
CREATE OR REPLACE FUNCTION public.user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.tenant_memberships
  WHERE profile_id = auth.uid()
    AND is_active = true
    AND branch_id IS NOT NULL
  LIMIT 1;
$$;

-- 3. Replace branch manager order policy with branch_id-scoped policy
DROP POLICY IF EXISTS "Branch managers can view branch orders" ON public.orders;

CREATE POLICY "Branch staff can view branch orders" ON public.orders
  FOR SELECT
  USING (
    branch_id IS NOT NULL
    AND branch_id = public.user_branch_id()
  );
