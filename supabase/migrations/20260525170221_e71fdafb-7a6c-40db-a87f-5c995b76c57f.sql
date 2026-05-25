
-- 1. Add branch_id columns
ALTER TABLE public.rate_card_clicks         ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.rate_card_papers         ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.rate_card_finishing      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.rate_card_photo_prints   ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.rate_card_business_cards ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rcc_branch_idx  ON public.rate_card_clicks(branch_id)         WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rcp_branch_idx  ON public.rate_card_papers(branch_id)         WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rcf_branch_idx  ON public.rate_card_finishing(branch_id)      WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rcpp_branch_idx ON public.rate_card_photo_prints(branch_id)   WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rcbc_branch_idx ON public.rate_card_business_cards(branch_id) WHERE branch_id IS NOT NULL;

-- 2. Replace scope CHECK constraints
ALTER TABLE public.rate_card_clicks         DROP CONSTRAINT IF EXISTS rcc_scope_tenant_chk;
ALTER TABLE public.rate_card_papers         DROP CONSTRAINT IF EXISTS rcp_scope_tenant_chk;
ALTER TABLE public.rate_card_finishing      DROP CONSTRAINT IF EXISTS rcf_scope_tenant_chk;
ALTER TABLE public.rate_card_photo_prints   DROP CONSTRAINT IF EXISTS rcpp_scope_tenant_chk;
ALTER TABLE public.rate_card_business_cards DROP CONSTRAINT IF EXISTS rate_card_business_cards_scope_chk;
ALTER TABLE public.rate_card_business_cards DROP CONSTRAINT IF EXISTS rate_card_business_cards_scope_type_check;

ALTER TABLE public.rate_card_clicks ADD CONSTRAINT rcc_scope_chk CHECK (
  (scope_type = 'master' AND tenant_id IS NULL AND branch_id IS NULL)
  OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND branch_id IS NULL)
  OR (scope_type = 'branch' AND tenant_id IS NOT NULL AND branch_id IS NOT NULL)
);
ALTER TABLE public.rate_card_papers ADD CONSTRAINT rcp_scope_chk CHECK (
  (scope_type = 'master' AND tenant_id IS NULL AND branch_id IS NULL)
  OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND branch_id IS NULL)
  OR (scope_type = 'branch' AND tenant_id IS NOT NULL AND branch_id IS NOT NULL)
);
ALTER TABLE public.rate_card_finishing ADD CONSTRAINT rcf_scope_chk CHECK (
  (scope_type = 'master' AND tenant_id IS NULL AND branch_id IS NULL)
  OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND branch_id IS NULL)
  OR (scope_type = 'branch' AND tenant_id IS NOT NULL AND branch_id IS NOT NULL)
);
ALTER TABLE public.rate_card_photo_prints ADD CONSTRAINT rcpp_scope_chk CHECK (
  (scope_type = 'master' AND tenant_id IS NULL AND branch_id IS NULL)
  OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND branch_id IS NULL)
  OR (scope_type = 'branch' AND tenant_id IS NOT NULL AND branch_id IS NOT NULL)
);
ALTER TABLE public.rate_card_business_cards ADD CONSTRAINT rcbc_scope_chk CHECK (
  (scope_type = 'master' AND tenant_id IS NULL AND branch_id IS NULL)
  OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND branch_id IS NULL)
  OR (scope_type = 'branch' AND tenant_id IS NOT NULL AND branch_id IS NOT NULL)
);

-- 3. Unique indexes for branch scope
CREATE UNIQUE INDEX IF NOT EXISTS rcc_branch_unique
  ON public.rate_card_clicks(branch_id, size, colour, sides) WHERE scope_type = 'branch';
CREATE UNIQUE INDEX IF NOT EXISTS rcp_branch_code_unique
  ON public.rate_card_papers(branch_id, code) WHERE scope_type = 'branch';
CREATE UNIQUE INDEX IF NOT EXISTS rcf_branch_code_unique
  ON public.rate_card_finishing(branch_id, code) WHERE scope_type = 'branch';
CREATE UNIQUE INDEX IF NOT EXISTS rcpp_branch_unique
  ON public.rate_card_photo_prints(branch_id, code) WHERE scope_type = 'branch';
CREATE UNIQUE INDEX IF NOT EXISTS rcbc_branch_code_unique
  ON public.rate_card_business_cards(branch_id, code) WHERE scope_type = 'branch';

-- 4. RLS policies for branch scope on each rate-card table
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['rate_card_clicks','rate_card_papers','rate_card_finishing','rate_card_photo_prints','rate_card_business_cards'];
  scope_cast text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- business_cards uses text scope_type, the others use rate_card_scope enum
    IF t = 'rate_card_business_cards' THEN
      scope_cast := '''branch''::text';
    ELSE
      scope_cast := '''branch''::rate_card_scope';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_branch_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_branch_write', t);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
      FOR SELECT TO authenticated, anon
      USING (
        scope_type = %s
        AND tenant_id IS NOT NULL
        AND branch_id IS NOT NULL
        AND (
          (public.current_storefront_tenant_id() IS NOT NULL AND tenant_id = public.current_storefront_tenant_id())
          OR public.user_is_tenant_admin(tenant_id)
          OR EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.tenant_id = %I.tenant_id
              AND tm.is_active = true
          )
        )
      )
    $p$, t || '_branch_read', t, scope_cast, t);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (
        scope_type = %s
        AND branch_id IS NOT NULL
        AND (
          public.user_is_tenant_admin(tenant_id)
          OR EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.is_active = true
              AND tm.branch_id = %I.branch_id
              AND tm.role IN ('branch_manager','store_operator','owner','admin')
          )
        )
      )
      WITH CHECK (
        scope_type = %s
        AND branch_id IS NOT NULL
        AND (
          public.user_is_tenant_admin(tenant_id)
          OR EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.profile_id = auth.uid()
              AND tm.is_active = true
              AND tm.branch_id = %I.branch_id
              AND tm.role IN ('branch_manager','store_operator','owner','admin')
          )
        )
      )
    $p$, t || '_branch_write', t, scope_cast, t, scope_cast, t);
  END LOOP;
END $$;

-- 5. Clone tenant pricing to a branch (idempotent)
CREATE OR REPLACE FUNCTION public.clone_tenant_pricing_to_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % has no tenant', p_branch_id;
  END IF;

  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, branch_id, size, colour, sides, sell_price, cost_price, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.size, t.colour, t.sides, t.sell_price, t.cost_price, t.is_active
  FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND b.size = t.size AND b.colour = t.colour AND b.sides = t.sides
    );

  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, branch_id, code, label, weight_gsm, finish, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.code, t.label, t.weight_gsm, t.finish, t.size, t.sell_price, t.cost_price, t.sort_order, t.is_active
  FROM public.rate_card_papers t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_papers b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id AND b.code = t.code
    );

  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, branch_id, code, label, category, pricing_basis, variant, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.code, t.label, t.category, t.pricing_basis, t.variant, t.size, t.sell_price, t.cost_price, t.sort_order, t.is_active
  FROM public.rate_card_finishing t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_finishing b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id AND b.code = t.code
    );

  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, branch_id, code, label, size_slug, width_mm, height_mm, finish, border_mm, sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.code, t.label, t.size_slug, t.width_mm, t.height_mm, t.finish, t.border_mm, t.sell_price, t.cost_price, t.min_quantity, t.sort_order, t.is_active
  FROM public.rate_card_photo_prints t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id AND b.code = t.code
    );

  INSERT INTO public.rate_card_business_cards
    (scope_type, tenant_id, branch_id, code, label, quantity, sides, paper, finish, sell_price, cost_price, sort_order, is_active)
  SELECT 'branch', v_tenant, p_branch_id, t.code, t.label, t.quantity, t.sides, t.paper, t.finish, t.sell_price, t.cost_price, t.sort_order, t.is_active
  FROM public.rate_card_business_cards t
  WHERE t.scope_type = 'tenant' AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_business_cards b
      WHERE b.scope_type = 'branch' AND b.branch_id = p_branch_id AND b.code = t.code
    );

  -- PRICING RULES: copy tenant-wide rules into branch-scoped rules
  INSERT INTO public.pricing_rules
    (tenant_id, branch_id, product_family_id, name, rule_type, conditions,
     price_value, is_active, sort_order, currency_code)
  SELECT v_tenant, p_branch_id, t.product_family_id, t.name, t.rule_type, t.conditions,
         t.price_value, t.is_active, t.sort_order, t.currency_code
  FROM public.pricing_rules t
  WHERE t.tenant_id = v_tenant AND t.branch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pricing_rules b
      WHERE b.tenant_id = v_tenant AND b.branch_id = p_branch_id
        AND b.name = t.name
        AND COALESCE(b.product_family_id::text,'') = COALESCE(t.product_family_id::text,'')
        AND b.currency_code = t.currency_code
    );
END;
$$;

-- 6. Resync (destructive): wipe branch + re-clone
CREATE OR REPLACE FUNCTION public.resync_branch_pricing_from_tenant(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % has no tenant', p_branch_id;
  END IF;

  IF NOT (
    public.user_is_tenant_admin(v_tenant)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = p_branch_id
        AND tm.role IN ('branch_manager','store_operator','owner','admin')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to resync branch %', p_branch_id;
  END IF;

  DELETE FROM public.rate_card_clicks         WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_papers         WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_finishing      WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_photo_prints   WHERE scope_type = 'branch'::rate_card_scope AND branch_id = p_branch_id;
  DELETE FROM public.rate_card_business_cards WHERE scope_type = 'branch' AND branch_id = p_branch_id;
  DELETE FROM public.pricing_rules            WHERE branch_id = p_branch_id;

  PERFORM public.clone_tenant_pricing_to_branch(p_branch_id);
END;
$$;

-- 7. Trigger: auto-clone on new branch
CREATE OR REPLACE FUNCTION public.trg_clone_pricing_for_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.clone_tenant_pricing_to_branch(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_clone_pricing_aft_ins ON public.branches;
CREATE TRIGGER branches_clone_pricing_aft_ins
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.trg_clone_pricing_for_new_branch();

-- 8. Backfill existing branches
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT id FROM public.branches WHERE is_active = true LOOP
    PERFORM public.clone_tenant_pricing_to_branch(b.id);
  END LOOP;
END $$;
