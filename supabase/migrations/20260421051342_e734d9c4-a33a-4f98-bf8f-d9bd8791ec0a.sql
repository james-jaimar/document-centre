
-- 1. Add is_demo flags
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_demo ON public.orders(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_profiles_is_demo ON public.profiles(is_demo) WHERE is_demo = true;

-- 2. Helper: is_demo_tenant
CREATE OR REPLACE FUNCTION public.is_demo_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND is_demo = true
  );
$$;

-- 3. Extend handle_new_user to honour is_demo metadata + auto-join demo tenant
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

  -- Demo path: auto-join to the demo tenant
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

-- 4. Seed the Demo tenant if it doesn't exist
DO $$
DECLARE
  v_app_id uuid;
  v_tenant_id uuid;
  v_branch_id uuid;
BEGIN
  -- Pick the first active app (web-to-print)
  SELECT id INTO v_app_id FROM public.apps WHERE is_active = true ORDER BY created_at LIMIT 1;

  IF v_app_id IS NULL THEN
    RAISE NOTICE 'No active app found — skipping demo tenant seed';
    RETURN;
  END IF;

  -- Create demo tenant
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'demo';
  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (slug, name, app_id, is_active, is_demo, onboarding_status)
    VALUES ('demo', 'Document Centre Demo', v_app_id, true, true, 'ready')
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants SET is_demo = true, is_active = true WHERE id = v_tenant_id;
  END IF;

  -- Create a default branch
  SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id LIMIT 1;
  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, name, code, country, is_active)
    VALUES (v_tenant_id, 'Demo Branch', 'DEMO', 'ZA', true)
    RETURNING id INTO v_branch_id;
  END IF;

  -- Seed branch capabilities for all product families
  PERFORM public.seed_branch_capabilities(v_branch_id);

  -- Number sequences for the demo app (only if not already present for this app)
  INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
  SELECT v_app_id, 'order', 'DEMO', 0
  WHERE NOT EXISTS (
    SELECT 1 FROM public.number_sequences WHERE app_id = v_app_id AND sequence_type = 'order'
  );
END $$;
