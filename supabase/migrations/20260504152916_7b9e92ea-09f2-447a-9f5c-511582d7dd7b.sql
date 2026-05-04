
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
  v_tenant record;
  v_is_demo boolean;
BEGIN
  v_is_demo := COALESCE((NEW.raw_user_meta_data ->> 'is_demo')::boolean, false);

  INSERT INTO public.profiles (id, display_name, email, first_name, last_name, is_demo)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    v_is_demo
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  -- Anonymous users: join them to the tenant specified in metadata
  -- (or fall back to demo tenant for backward compat with /try)
  IF NEW.is_anonymous THEN
    v_slug := COALESCE(NEW.raw_user_meta_data ->> 'tenant_slug', 'demo');

    SELECT id, app_id INTO v_tenant
    FROM public.tenants
    WHERE slug = v_slug AND is_active = true
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
      INSERT INTO public.tenant_memberships (profile_id, tenant_id, app_id, role)
      VALUES (NEW.id, v_tenant.id, v_tenant.app_id, 'customer')
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles
      SET tenant_id = v_tenant.id, is_demo = (v_slug = 'demo')
      WHERE id = NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  -- Demo path (non-anonymous demo users, legacy)
  IF v_is_demo THEN
    SELECT id, app_id INTO v_tenant
    FROM public.tenants
    WHERE slug = 'demo' AND is_active = true
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
      INSERT INTO public.tenant_memberships (profile_id, tenant_id, app_id, role)
      VALUES (NEW.id, v_tenant.id, v_tenant.app_id, 'customer')
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles SET tenant_id = v_tenant.id WHERE id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Standard signup with explicit tenant slug in metadata
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
