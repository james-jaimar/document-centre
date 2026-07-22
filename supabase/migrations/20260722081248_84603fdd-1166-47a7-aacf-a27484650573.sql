-- Extend branch-creation trigger to also clone tenant delivery
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
  BEGIN
    PERFORM public.seed_branch_capabilities(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_clone_pricing_for_new_branch: capability seed failed for branch %: %', NEW.id, SQLERRM;
  END;
  BEGIN
    PERFORM public.clone_tenant_delivery_to_branch(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_clone_pricing_for_new_branch: delivery clone failed for branch %: %', NEW.id, SQLERRM;
  END;
  UPDATE public.branches SET pricing_seeded_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Extend ensure_branch_pricing_seeded to self-heal delivery too
CREATE OR REPLACE FUNCTION public.ensure_branch_pricing_seeded(_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already timestamptz;
  v_tenant uuid;
  v_cap_count int;
  v_zone_count int;
  v_did boolean := false;
BEGIN
  SELECT tenant_id, pricing_seeded_at INTO v_tenant, v_already
  FROM public.branches WHERE id = _branch_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_tenant_admin(v_tenant)
    OR public.caller_has_branch_access(_branch_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to seed pricing for branch %', _branch_id;
  END IF;

  IF v_already IS NULL THEN
    PERFORM public.clone_tenant_catalog_to_branch(_branch_id);
    PERFORM public.clone_tenant_pricing_to_branch(_branch_id);
    PERFORM public.seed_branch_capabilities(_branch_id);
    PERFORM public.clone_tenant_delivery_to_branch(_branch_id);
    UPDATE public.branches SET pricing_seeded_at = now() WHERE id = _branch_id;
    RETURN true;
  END IF;

  SELECT count(*) INTO v_cap_count FROM public.branch_capabilities WHERE branch_id = _branch_id;
  IF v_cap_count = 0 THEN
    PERFORM public.seed_branch_capabilities(_branch_id);
    v_did := true;
  END IF;

  SELECT count(*) INTO v_zone_count FROM public.delivery_zones
    WHERE scope_type = 'branch' AND branch_id = _branch_id;
  IF v_zone_count = 0 THEN
    PERFORM public.clone_tenant_delivery_to_branch(_branch_id);
    v_did := true;
  END IF;

  RETURN v_did;
END;
$$;

-- Backfill: clone delivery for every branch that has no branch-scoped zones
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.branches b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.delivery_zones dz
      WHERE dz.scope_type = 'branch' AND dz.branch_id = b.id
    )
  LOOP
    BEGIN
      PERFORM public.clone_tenant_delivery_to_branch(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill delivery clone failed for branch %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;