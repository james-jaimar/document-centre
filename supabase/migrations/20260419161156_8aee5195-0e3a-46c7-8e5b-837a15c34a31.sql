-- 1. Backfill profiles.email from auth.users.email
UPDATE public.profiles p
SET email = au.email, updated_at = now()
FROM auth.users au
WHERE p.id = au.id
  AND p.email IS DISTINCT FROM au.email;

-- 2. Update handle_new_user() to populate email + first/last name
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
  INSERT INTO public.profiles (id, display_name, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  v_slug := NEW.raw_user_meta_data ->> 'tenant_slug';
  IF v_slug IS NOT NULL THEN
    SELECT id, app_id INTO v_tenant
    FROM public.tenants
    WHERE slug = v_slug AND is_active = true
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
      INSERT INTO public.tenant_memberships (profile_id, tenant_id, app_id, role)
      VALUES (NEW.id, v_tenant.id, v_tenant.app_id, 'customer');

      UPDATE public.profiles SET tenant_id = v_tenant.id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Trigger: keep profiles.email synced when auth email changes
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email, updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_email_on_auth_update ON auth.users;
CREATE TRIGGER sync_profile_email_on_auth_update
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_email_from_auth();