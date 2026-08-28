ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
SET is_anonymous = true
FROM auth.users u
WHERE u.id = p.id AND COALESCE(u.is_anonymous, false) = true AND p.is_anonymous = false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_tenant record;
  v_is_demo boolean;
BEGIN
  v_is_demo := COALESCE((NEW.raw_user_meta_data ->> 'is_demo')::boolean, false);

  INSERT INTO public.profiles (id, display_name, email, first_name, last_name, is_demo, is_anonymous)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    v_is_demo,
    COALESCE(NEW.is_anonymous, false)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

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
$$;

CREATE OR REPLACE FUNCTION public.get_branch_customers(_branch_id uuid)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  order_count bigint,
  total_spent numeric,
  last_order_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.caller_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for branch %', _branch_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH order_stats AS (
    SELECT
      o.ordered_by_profile_id AS profile_id,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(o.total_amount), 0)::numeric AS total_spent,
      MAX(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE o.branch_id = _branch_id
      AND o.order_status <> 'cart'
      AND o.ordered_by_profile_id IS NOT NULL
    GROUP BY o.ordered_by_profile_id
  ),
  quote_profiles AS (
    SELECT DISTINCT q.created_by_profile_id AS profile_id
    FROM public.quotes q
    WHERE q.branch_id = _branch_id
      AND q.created_by_profile_id IS NOT NULL
  ),
  membership_profiles AS (
    SELECT DISTINCT m.profile_id
    FROM public.tenant_memberships m
    WHERE m.branch_id = _branch_id
      AND m.is_active
      AND m.role = 'customer'
  ),
  all_profiles AS (
    SELECT profile_id FROM order_stats
    UNION
    SELECT profile_id FROM quote_profiles
    UNION
    SELECT profile_id FROM membership_profiles
  )
  SELECT
    p.id AS profile_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    COALESCE(os.order_count, 0)::bigint,
    COALESCE(os.total_spent, 0)::numeric,
    os.last_order_at
  FROM all_profiles ap
  JOIN public.profiles p ON p.id = ap.profile_id
  LEFT JOIN order_stats os ON os.profile_id = ap.profile_id
  WHERE COALESCE(p.is_anonymous, false) = false
    AND p.email IS NOT NULL
  ORDER BY os.last_order_at DESC NULLS LAST, p.display_name ASC NULLS LAST;
END;
$$;