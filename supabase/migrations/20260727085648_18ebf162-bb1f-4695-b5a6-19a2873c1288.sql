
-- 1. Drop authorisation gate from the internal catalog clone so trigger + RPC can seed.
--    (Direct end-user writes to branch catalog remain protected by RLS.)
CREATE OR REPLACE FUNCTION public.clone_tenant_catalog_to_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, branch_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.width_mm, s.height_mm, s.iso_name, s.region, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_sizes
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_sizes b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, branch_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.attribute, s.code, s.label, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (attribute, code) * FROM public.catalog_print_attrs
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY attribute, code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.attribute=s.attribute AND b.code=s.code);

  INSERT INTO public.catalog_papers (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata, stocked_sizes, is_cover_stock, is_edge_to_edge_only)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.weight_gsm, s.finish, s.category, s.sort_order, s.is_active, s.metadata, s.stocked_sizes, s.is_cover_stock, s.is_edge_to_edge_only
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_papers
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_papers b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, branch_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.category, s.variant, s.pricing_basis, s.sort_order, s.is_active, s.metadata
  FROM (
    SELECT DISTINCT ON (code) * FROM public.catalog_finishing
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_finishing b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, branch_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bp.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sp.code, cp.size_code)
      sp.code AS paper_code, cp.size_code, cp.sell_price_minor, cp.cost_price_minor, cp.is_active,
      cp.scope_type
    FROM public.catalog_paper_prices cp
    JOIN public.catalog_papers sp ON sp.id = cp.paper_id
    WHERE (cp.scope_type='tenant' AND cp.tenant_id=v_tenant AND cp.branch_id IS NULL)
       OR cp.scope_type='master'
    ORDER BY sp.code, cp.size_code, CASE cp.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_papers bp
    ON bp.code = src.paper_code AND bp.scope_type='branch' AND bp.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_paper_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.paper_id=bp.id AND b.size_code=src.size_code
  );

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, branch_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, bf.id, src.size_code, src.sell_price_minor, src.cost_price_minor, src.is_active
  FROM (
    SELECT DISTINCT ON (sf.code, COALESCE(cf.size_code,'__any__'))
      sf.code AS finishing_code, cf.size_code, cf.sell_price_minor, cf.cost_price_minor, cf.is_active,
      cf.scope_type
    FROM public.catalog_finishing_prices cf
    JOIN public.catalog_finishing sf ON sf.id = cf.finishing_id
    WHERE (cf.scope_type='tenant' AND cf.tenant_id=v_tenant AND cf.branch_id IS NULL)
       OR cf.scope_type='master'
    ORDER BY sf.code, COALESCE(cf.size_code,'__any__'), CASE cf.scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) src
  JOIN public.catalog_finishing bf
    ON bf.code = src.finishing_code AND bf.scope_type='branch' AND bf.branch_id = p_branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_finishing_prices b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.finishing_id=bf.id
      AND COALESCE(b.size_code,'__any__')=COALESCE(src.size_code,'__any__')
  );

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default)
  SELECT 'branch', v_tenant, p_branch_id, s.product_family_id, s.catalog, s.sub_attribute, s.item_code, s.sort_order, s.is_default
  FROM (
    SELECT DISTINCT ON (product_family_id, catalog, COALESCE(sub_attribute,''), item_code) *
    FROM public.product_catalog_links
    WHERE (scope_type='tenant' AND tenant_id=v_tenant AND branch_id IS NULL) OR scope_type='master'
    ORDER BY product_family_id, catalog, COALESCE(sub_attribute,''), item_code, CASE scope_type WHEN 'tenant' THEN 0 ELSE 1 END
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.product_catalog_links b
    WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.product_family_id=s.product_family_id AND b.catalog=s.catalog
      AND COALESCE(b.sub_attribute,'') = COALESCE(s.sub_attribute,'') AND b.item_code=s.item_code);
END $function$;

-- 2. Self-healing safety net: don't short-circuit on pricing_seeded_at, check each area.
CREATE OR REPLACE FUNCTION public.ensure_branch_pricing_seeded(_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_did boolean := false;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = _branch_id;
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

  -- Catalog: sizes empty => run full catalog clone (idempotent, per-area WHERE NOT EXISTS).
  IF NOT EXISTS (SELECT 1 FROM public.catalog_sizes
                 WHERE scope_type='branch' AND branch_id=_branch_id) THEN
    PERFORM public.clone_tenant_catalog_to_branch(_branch_id);
    v_did := true;
  ELSIF NOT EXISTS (SELECT 1 FROM public.catalog_papers
                    WHERE scope_type='branch' AND branch_id=_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices
                    WHERE scope_type='branch' AND branch_id=_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices
                    WHERE scope_type='branch' AND branch_id=_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.product_catalog_links
                    WHERE scope_type='branch' AND branch_id=_branch_id) THEN
    PERFORM public.clone_tenant_catalog_to_branch(_branch_id);
    v_did := true;
  END IF;

  -- Rate cards: any of the three empty => run pricing clone.
  IF NOT EXISTS (SELECT 1 FROM public.rate_card_clicks
                 WHERE scope_type='branch' AND branch_id=_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.rate_card_photo_prints
                    WHERE scope_type='branch' AND branch_id=_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.rate_card_business_cards
                    WHERE scope_type='branch' AND branch_id=_branch_id) THEN
    PERFORM public.clone_tenant_pricing_to_branch(_branch_id);
    v_did := true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branch_capabilities WHERE branch_id=_branch_id) THEN
    PERFORM public.seed_branch_capabilities(_branch_id);
    v_did := true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.delivery_zones
                 WHERE scope_type='branch' AND branch_id=_branch_id) THEN
    PERFORM public.clone_tenant_delivery_to_branch(_branch_id);
    v_did := true;
  END IF;

  UPDATE public.branches
     SET pricing_seeded_at = now()
   WHERE id = _branch_id AND pricing_seeded_at IS NULL;

  RETURN v_did;
END;
$function$;

-- 3. Branch-insert trigger: raise loudly on catalog failure; keep the rest wrapped
--    so a downstream miss doesn't roll back the branch insert.
CREATE OR REPLACE FUNCTION public.trg_clone_pricing_for_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Catalog first, and if this blows up we WANT the branch insert to fail so
  -- we hear about it immediately instead of shipping a half-seeded branch.
  PERFORM public.clone_tenant_catalog_to_branch(NEW.id);

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
$function$;

-- 4. Platform-admin backfill sweep.
CREATE OR REPLACE FUNCTION public.platform_backfill_branch_seeding()
RETURNS TABLE(branch_id uuid, healed boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_tenant uuid;
  v_did boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR r IN SELECT id FROM public.branches LOOP
    BEGIN
      SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = r.id;
      v_did := false;

      IF NOT EXISTS (SELECT 1 FROM public.catalog_sizes WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_papers WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.product_catalog_links WHERE scope_type='branch' AND branch_id=r.id) THEN
        PERFORM public.clone_tenant_catalog_to_branch(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.rate_card_clicks WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.rate_card_photo_prints WHERE scope_type='branch' AND branch_id=r.id)
         OR NOT EXISTS (SELECT 1 FROM public.rate_card_business_cards WHERE scope_type='branch' AND branch_id=r.id) THEN
        PERFORM public.clone_tenant_pricing_to_branch(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.branch_capabilities WHERE branch_id=r.id) THEN
        PERFORM public.seed_branch_capabilities(r.id);
        v_did := true;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.delivery_zones WHERE scope_type='branch' AND branch_id=r.id) THEN
        PERFORM public.clone_tenant_delivery_to_branch(r.id);
        v_did := true;
      END IF;

      UPDATE public.branches SET pricing_seeded_at = now()
       WHERE id = r.id AND pricing_seeded_at IS NULL;

      branch_id := r.id; healed := v_did; err := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      branch_id := r.id; healed := false; err := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.platform_backfill_branch_seeding() TO authenticated;
