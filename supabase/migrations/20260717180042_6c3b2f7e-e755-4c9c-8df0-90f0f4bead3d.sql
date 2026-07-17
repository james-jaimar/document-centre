
-- Add pricing_seeded_at flag on branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS pricing_seeded_at timestamptz;

-- Extend the AFTER INSERT trigger fn to also clone the catalog
CREATE OR REPLACE FUNCTION public.trg_clone_pricing_for_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.clone_tenant_catalog_to_branch(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_clone_pricing_for_new_branch: catalog clone failed for branch %: %', NEW.id, SQLERRM;
  END;
  BEGIN
    PERFORM public.clone_tenant_pricing_to_branch(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_clone_pricing_for_new_branch: pricing clone failed for branch %: %', NEW.id, SQLERRM;
  END;
  UPDATE public.branches SET pricing_seeded_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Idempotent client-callable seeder (safety net + backfill)
CREATE OR REPLACE FUNCTION public.ensure_branch_pricing_seeded(_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already timestamptz;
  v_tenant uuid;
BEGIN
  SELECT tenant_id, pricing_seeded_at INTO v_tenant, v_already
  FROM public.branches WHERE id = _branch_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Authorise: platform admin, tenant admin, or branch member
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_tenant_admin(v_tenant)
    OR public.caller_has_branch_access(_branch_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to seed pricing for branch %', _branch_id;
  END IF;

  PERFORM public.clone_tenant_catalog_to_branch(_branch_id);
  PERFORM public.clone_tenant_pricing_to_branch(_branch_id);

  UPDATE public.branches SET pricing_seeded_at = now() WHERE id = _branch_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_branch_pricing_seeded(uuid) TO authenticated;

-- Backfill: seed every existing branch that hasn't been seeded yet
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.branches WHERE pricing_seeded_at IS NULL LOOP
    BEGIN
      PERFORM public.clone_tenant_catalog_to_branch(r.id);
      PERFORM public.clone_tenant_pricing_to_branch(r.id);
      UPDATE public.branches SET pricing_seeded_at = now() WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill seed failed for branch %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
