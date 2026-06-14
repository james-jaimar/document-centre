
-- =========================================================================
-- Cascade Master Catalogue → Tenant → Branch (copy-down)
-- =========================================================================

-- 0. Drop dependent FK constraints that pin code uniqueness
ALTER TABLE public.catalog_paper_prices       DROP CONSTRAINT IF EXISTS catalog_paper_prices_size_code_fkey;
ALTER TABLE public.catalog_finishing_prices   DROP CONSTRAINT IF EXISTS catalog_finishing_prices_size_code_fkey;
ALTER TABLE public.rate_card_papers           DROP CONSTRAINT IF EXISTS rate_card_papers_catalog_size_code_fkey;
ALTER TABLE public.rate_card_finishing        DROP CONSTRAINT IF EXISTS rate_card_finishing_catalog_size_code_fkey;
ALTER TABLE public.rate_card_clicks           DROP CONSTRAINT IF EXISTS rate_card_clicks_catalog_size_code_fkey;
-- Possible paper/finishing code FKs (drop if present)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype='f'
      AND confrelid::regclass::text IN ('public.catalog_papers','public.catalog_finishing','public.catalog_print_attrs')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- 1. Scope enum
DO $$ BEGIN
  CREATE TYPE public.catalog_scope AS ENUM ('master','tenant','branch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add scope columns
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_sizes','catalog_print_attrs','catalog_papers','catalog_finishing',
    'catalog_paper_prices','catalog_finishing_prices','product_catalog_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS scope_type public.catalog_scope NOT NULL DEFAULT ''master''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (scope_type, tenant_id, branch_id)', t || '_scope_idx', t);
  END LOOP;
END $$;

-- 3. Replace global unique constraints with scoped unique indexes
ALTER TABLE public.catalog_sizes       DROP CONSTRAINT IF EXISTS catalog_sizes_code_key;
DROP INDEX IF EXISTS public.catalog_sizes_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_sizes_scope_code_uidx
  ON public.catalog_sizes (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), code);

ALTER TABLE public.catalog_print_attrs DROP CONSTRAINT IF EXISTS catalog_print_attrs_attribute_code_key;
DROP INDEX IF EXISTS public.catalog_print_attrs_attribute_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_print_attrs_scope_attr_code_uidx
  ON public.catalog_print_attrs (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), attribute, code);

ALTER TABLE public.catalog_papers      DROP CONSTRAINT IF EXISTS catalog_papers_code_key;
DROP INDEX IF EXISTS public.catalog_papers_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_papers_scope_code_uidx
  ON public.catalog_papers (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), code);

ALTER TABLE public.catalog_finishing   DROP CONSTRAINT IF EXISTS catalog_finishing_code_key;
DROP INDEX IF EXISTS public.catalog_finishing_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_finishing_scope_code_uidx
  ON public.catalog_finishing (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), code);

ALTER TABLE public.catalog_paper_prices DROP CONSTRAINT IF EXISTS catalog_paper_prices_paper_id_size_code_key;
DROP INDEX IF EXISTS public.catalog_paper_prices_paper_id_size_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_paper_prices_scope_uidx
  ON public.catalog_paper_prices (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), paper_id, size_code);

ALTER TABLE public.catalog_finishing_prices DROP CONSTRAINT IF EXISTS catalog_finishing_prices_finishing_id_size_code_key;
DROP INDEX IF EXISTS public.catalog_finishing_prices_finishing_id_size_code_key;
DROP INDEX IF EXISTS public.catalog_finishing_prices_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_finishing_prices_scope_uidx
  ON public.catalog_finishing_prices (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), finishing_id, COALESCE(size_code,'__any__'));

ALTER TABLE public.product_catalog_links DROP CONSTRAINT IF EXISTS product_catalog_links_family_catalog_sub_item_key;
DROP INDEX IF EXISTS public.product_catalog_links_family_catalog_sub_item_key;
DROP INDEX IF EXISTS public.product_catalog_links_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS product_catalog_links_scope_uidx
  ON public.product_catalog_links (scope_type, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), product_family_id, catalog, sub_attribute, item_code);

-- 4. Branch-management helper
CREATE OR REPLACE FUNCTION public.user_can_manage_branch_catalog(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.branches b ON b.id = p_branch_id
    WHERE m.profile_id = auth.uid()
      AND m.is_active
      AND m.tenant_id = b.tenant_id
      AND (m.branch_id IS NULL OR m.branch_id = p_branch_id)
      AND m.role IN ('Owner','Admin')
  ) OR public.has_role(auth.uid(), 'platform_admin'::app_role);
$$;

-- 5. Tenant + branch RLS policies on each table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_sizes','catalog_print_attrs','catalog_papers','catalog_finishing',
    'catalog_paper_prices','catalog_finishing_prices'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
      WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
    $f$, t || '_tenant_write', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_branch_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (scope_type = 'branch' AND branch_id IS NOT NULL AND public.user_can_manage_branch_catalog(branch_id))
      WITH CHECK (scope_type = 'branch' AND branch_id IS NOT NULL AND public.user_can_manage_branch_catalog(branch_id))
    $f$, t || '_branch_write', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS product_catalog_links_branch_write ON public.product_catalog_links;
CREATE POLICY product_catalog_links_branch_write ON public.product_catalog_links
  FOR ALL TO authenticated
  USING (scope_type = 'branch' AND branch_id IS NOT NULL AND public.user_can_manage_branch_catalog(branch_id))
  WITH CHECK (scope_type = 'branch' AND branch_id IS NOT NULL AND public.user_can_manage_branch_catalog(branch_id));

-- 6. Clone master -> tenant
CREATE OR REPLACE FUNCTION public.clone_master_catalog_to_tenant(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.user_is_tenant_admin(p_tenant_id) OR public.has_role(auth.uid(),'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.catalog_sizes (scope_type, tenant_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.width_mm, m.height_mm, m.iso_name, m.region, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_sizes m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_sizes t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.attribute, m.code, m.label, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_print_attrs m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.attribute=m.attribute AND t.code=m.code);

  INSERT INTO public.catalog_papers (scope_type, tenant_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.category, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_papers m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_papers t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_finishing (scope_type, tenant_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.variant, m.pricing_basis, m.sort_order, m.is_active, m.metadata
  FROM public.catalog_finishing m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.code=m.code);

  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, m.paper_id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_paper_prices m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id AND t.paper_id=m.paper_id AND t.size_code=m.size_code);

  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'tenant', p_tenant_id, m.finishing_id, m.size_code, m.sell_price_minor, m.cost_price_minor, m.is_active
  FROM public.catalog_finishing_prices m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices t
      WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
        AND t.finishing_id=m.finishing_id
        AND COALESCE(t.size_code,'__any__')=COALESCE(m.size_code,'__any__'));

  INSERT INTO public.product_catalog_links (scope_type, tenant_id, product_family_id, catalog, sub_attribute, item_code, is_enabled, metadata)
  SELECT 'tenant', p_tenant_id, m.product_family_id, m.catalog, m.sub_attribute, m.item_code, m.is_enabled, m.metadata
  FROM public.product_catalog_links m
  WHERE m.scope_type='master'
    AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links t WHERE t.scope_type='tenant' AND t.tenant_id=p_tenant_id
      AND t.product_family_id=m.product_family_id AND t.catalog=m.catalog AND t.sub_attribute=m.sub_attribute AND t.item_code=m.item_code);
END $$;

-- 7. Resync tenant
CREATE OR REPLACE FUNCTION public.resync_tenant_catalog_from_master(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.user_is_tenant_admin(p_tenant_id) OR public.has_role(auth.uid(),'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  DELETE FROM public.product_catalog_links     WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_finishing_prices  WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_paper_prices      WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_finishing         WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_papers            WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_print_attrs       WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  DELETE FROM public.catalog_sizes             WHERE scope_type='tenant' AND tenant_id=p_tenant_id;
  PERFORM public.clone_master_catalog_to_tenant(p_tenant_id);
END $$;

-- 8. Clone tenant (or master fallback) -> branch
CREATE OR REPLACE FUNCTION public.clone_tenant_catalog_to_branch(p_branch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_has boolean;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.user_can_manage_branch_catalog(p_branch_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.catalog_sizes WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_sizes (scope_type, tenant_id, branch_id, code, label, width_mm, height_mm, iso_name, region, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.width_mm, s.height_mm, s.iso_name, s.region, s.sort_order, s.is_active, s.metadata
  FROM public.catalog_sizes s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_sizes b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  SELECT EXISTS (SELECT 1 FROM public.catalog_print_attrs WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_print_attrs (scope_type, tenant_id, branch_id, attribute, code, label, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.attribute, s.code, s.label, s.sort_order, s.is_active, s.metadata
  FROM public.catalog_print_attrs s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.attribute=s.attribute AND b.code=s.code);

  SELECT EXISTS (SELECT 1 FROM public.catalog_papers WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_papers (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, category, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.weight_gsm, s.finish, s.category, s.sort_order, s.is_active, s.metadata
  FROM public.catalog_papers s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_papers b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  SELECT EXISTS (SELECT 1 FROM public.catalog_finishing WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_finishing (scope_type, tenant_id, branch_id, code, label, category, variant, pricing_basis, sort_order, is_active, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.code, s.label, s.category, s.variant, s.pricing_basis, s.sort_order, s.is_active, s.metadata
  FROM public.catalog_finishing s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.code=s.code);

  SELECT EXISTS (SELECT 1 FROM public.catalog_paper_prices WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_paper_prices (scope_type, tenant_id, branch_id, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, s.paper_id, s.size_code, s.sell_price_minor, s.cost_price_minor, s.is_active
  FROM public.catalog_paper_prices s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_paper_prices b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.paper_id=s.paper_id AND b.size_code=s.size_code);

  SELECT EXISTS (SELECT 1 FROM public.catalog_finishing_prices WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.catalog_finishing_prices (scope_type, tenant_id, branch_id, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
  SELECT 'branch', v_tenant, p_branch_id, s.finishing_id, s.size_code, s.sell_price_minor, s.cost_price_minor, s.is_active
  FROM public.catalog_finishing_prices s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing_prices b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id AND b.finishing_id=s.finishing_id AND COALESCE(b.size_code,'__any__')=COALESCE(s.size_code,'__any__'));

  SELECT EXISTS (SELECT 1 FROM public.product_catalog_links WHERE scope_type='tenant' AND tenant_id=v_tenant) INTO v_has;
  INSERT INTO public.product_catalog_links (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, is_enabled, metadata)
  SELECT 'branch', v_tenant, p_branch_id, s.product_family_id, s.catalog, s.sub_attribute, s.item_code, s.is_enabled, s.metadata
  FROM public.product_catalog_links s
  WHERE ((v_has AND s.scope_type='tenant' AND s.tenant_id=v_tenant)
      OR (NOT v_has AND s.scope_type='master'))
    AND NOT EXISTS (SELECT 1 FROM public.product_catalog_links b WHERE b.scope_type='branch' AND b.branch_id=p_branch_id
      AND b.product_family_id=s.product_family_id AND b.catalog=s.catalog AND b.sub_attribute=s.sub_attribute AND b.item_code=s.item_code);
END $$;

-- 9. Resync branch
CREATE OR REPLACE FUNCTION public.resync_branch_catalog_from_tenant(p_branch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.user_can_manage_branch_catalog(p_branch_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  DELETE FROM public.product_catalog_links     WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_finishing_prices  WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_paper_prices      WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_finishing         WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_papers            WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_print_attrs       WHERE scope_type='branch' AND branch_id=p_branch_id;
  DELETE FROM public.catalog_sizes             WHERE scope_type='branch' AND branch_id=p_branch_id;
  PERFORM public.clone_tenant_catalog_to_branch(p_branch_id);
END $$;

-- 10. Grants
GRANT EXECUTE ON FUNCTION public.clone_master_catalog_to_tenant(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.resync_tenant_catalog_from_master(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_tenant_catalog_to_branch(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.resync_branch_catalog_from_tenant(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_branch_catalog(uuid)      TO authenticated;
