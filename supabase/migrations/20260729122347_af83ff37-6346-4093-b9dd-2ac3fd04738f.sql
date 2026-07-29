
-- ============================================================================
-- Canvas Prints — base prices per size × wrap depth
-- ============================================================================
CREATE TABLE public.rate_card_canvas_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  size_slug text NOT NULL,
  size_label text NOT NULL,
  width_mm numeric NOT NULL,
  height_mm numeric NOT NULL,
  wrap_mm integer NOT NULL CHECK (wrap_mm IN (25, 38, 50)),
  sell_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness per scope: master keyed by (size, wrap), tenant/branch keyed with their scope id.
CREATE UNIQUE INDEX rccan_master_unique ON public.rate_card_canvas_prints
  (size_slug, wrap_mm) WHERE scope_type = 'master';
CREATE UNIQUE INDEX rccan_tenant_unique ON public.rate_card_canvas_prints
  (tenant_id, size_slug, wrap_mm) WHERE scope_type = 'tenant';
CREATE UNIQUE INDEX rccan_branch_unique ON public.rate_card_canvas_prints
  (branch_id, size_slug, wrap_mm) WHERE scope_type = 'branch';

GRANT SELECT ON public.rate_card_canvas_prints TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_card_canvas_prints TO authenticated;
GRANT ALL ON public.rate_card_canvas_prints TO service_role;

ALTER TABLE public.rate_card_canvas_prints ENABLE ROW LEVEL SECURITY;

-- Read: storefront + tenant staff can see active rows in their scope; master is always readable.
CREATE POLICY rccan_read ON public.rate_card_canvas_prints
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'
    OR (
      scope_type = 'tenant'
      AND tenant_id IS NOT NULL
      AND (
        (current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id())
        OR user_is_tenant_admin(tenant_id)
      )
    )
    OR (
      scope_type = 'branch'
      AND branch_id IS NOT NULL
      AND tenant_id IS NOT NULL
      AND (
        (current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id())
        OR user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.tenant_id = rate_card_canvas_prints.tenant_id
            AND tm.is_active = true
        )
      )
    )
  )
);

CREATE POLICY rccan_master_write_platform_admin ON public.rate_card_canvas_prints
FOR ALL
USING (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rccan_tenant_write_admin ON public.rate_card_canvas_prints
FOR ALL
USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id));

CREATE POLICY rccan_branch_write ON public.rate_card_canvas_prints
FOR ALL
USING (
  scope_type = 'branch'
  AND branch_id IS NOT NULL
  AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_canvas_prints.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
)
WITH CHECK (
  scope_type = 'branch'
  AND branch_id IS NOT NULL
  AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_canvas_prints.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
);

CREATE TRIGGER trg_rccan_updated_at BEFORE UPDATE ON public.rate_card_canvas_prints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Canvas Wrap-mode surcharges
-- ============================================================================
CREATE TABLE public.rate_card_canvas_wrap_surcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type rate_card_scope NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  wrap_mode text NOT NULL CHECK (wrap_mode IN (
    'no_edge_print','gallery_wrap','mirror_wrap','blur_wrap','colour_wrap','face_only'
  )),
  sell_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rccws_master_unique ON public.rate_card_canvas_wrap_surcharges
  (wrap_mode) WHERE scope_type = 'master';
CREATE UNIQUE INDEX rccws_tenant_unique ON public.rate_card_canvas_wrap_surcharges
  (tenant_id, wrap_mode) WHERE scope_type = 'tenant';
CREATE UNIQUE INDEX rccws_branch_unique ON public.rate_card_canvas_wrap_surcharges
  (branch_id, wrap_mode) WHERE scope_type = 'branch';

GRANT SELECT ON public.rate_card_canvas_wrap_surcharges TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_card_canvas_wrap_surcharges TO authenticated;
GRANT ALL ON public.rate_card_canvas_wrap_surcharges TO service_role;

ALTER TABLE public.rate_card_canvas_wrap_surcharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY rccws_read ON public.rate_card_canvas_wrap_surcharges
FOR SELECT
USING (
  is_active = true
  AND (
    scope_type = 'master'
    OR (
      scope_type = 'tenant'
      AND tenant_id IS NOT NULL
      AND (
        (current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id())
        OR user_is_tenant_admin(tenant_id)
      )
    )
    OR (
      scope_type = 'branch'
      AND branch_id IS NOT NULL
      AND tenant_id IS NOT NULL
      AND (
        (current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id())
        OR user_is_tenant_admin(tenant_id)
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.profile_id = auth.uid()
            AND tm.tenant_id = rate_card_canvas_wrap_surcharges.tenant_id
            AND tm.is_active = true
        )
      )
    )
  )
);

CREATE POLICY rccws_master_write_platform_admin ON public.rate_card_canvas_wrap_surcharges
FOR ALL
USING (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY rccws_tenant_write_admin ON public.rate_card_canvas_wrap_surcharges
FOR ALL
USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id))
WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id));

CREATE POLICY rccws_branch_write ON public.rate_card_canvas_wrap_surcharges
FOR ALL
USING (
  scope_type = 'branch'
  AND branch_id IS NOT NULL
  AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_canvas_wrap_surcharges.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
)
WITH CHECK (
  scope_type = 'branch'
  AND branch_id IS NOT NULL
  AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_canvas_wrap_surcharges.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
);

CREATE TRIGGER trg_rccws_updated_at BEFORE UPDATE ON public.rate_card_canvas_wrap_surcharges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed master surcharge rows (all zero) so the surcharge editor is never blank.
INSERT INTO public.rate_card_canvas_wrap_surcharges (scope_type, wrap_mode, sell_price, cost_price, is_active)
VALUES
  ('master','no_edge_print',0,0,true),
  ('master','gallery_wrap',0,0,true),
  ('master','mirror_wrap',0,0,true),
  ('master','blur_wrap',0,0,true),
  ('master','colour_wrap',0,0,true),
  ('master','face_only',0,0,true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Extend clone functions so canvas rows cascade like the other rate cards
-- ============================================================================
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, variant_code, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.variant_code, m.sell_price, m.cost_price, m.is_active, m.catalog_size_code
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size)) = COALESCE(NULLIF(lower(m.catalog_size_code), ''), lower(m.size))
        AND t.colour = m.colour AND t.sides = m.sides
        AND COALESCE(NULLIF(lower(t.variant_code), ''), '') = COALESCE(NULLIF(lower(m.variant_code), ''), '')
    );

  INSERT INTO public.rate_card_photo_prints
    (scope_type, tenant_id, code, label, size_slug, width_mm, height_mm, finish, border_mm,
     sell_price, cost_price, min_quantity, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.size_slug, m.width_mm, m.height_mm, m.finish, m.border_mm,
         m.sell_price, m.cost_price, m.min_quantity, m.sort_order, m.is_active
  FROM public.rate_card_photo_prints m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_photo_prints t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  INSERT INTO public.rate_card_business_cards
    (scope_type, tenant_id, code, label, quantity, sides, paper, finish,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.quantity, m.sides, m.paper, m.finish,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_business_cards m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_business_cards t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  INSERT INTO public.rate_card_canvas_prints
    (scope_type, tenant_id, size_slug, size_label, width_mm, height_mm, wrap_mm,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.size_slug, m.size_label, m.width_mm, m.height_mm, m.wrap_mm,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_canvas_prints m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_canvas_prints t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND t.size_slug = m.size_slug AND t.wrap_mm = m.wrap_mm
    );

  INSERT INTO public.rate_card_canvas_wrap_surcharges
    (scope_type, tenant_id, wrap_mode, sell_price, cost_price, is_active)
  SELECT 'tenant', p_tenant_id, m.wrap_mode, m.sell_price, m.cost_price, m.is_active
  FROM public.rate_card_canvas_wrap_surcharges m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_canvas_wrap_surcharges t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.wrap_mode = m.wrap_mode
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.clone_tenant_pricing_to_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % has no tenant', p_branch_id;
  END IF;

  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, branch_id, size, colour, sides, variant_code, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.size, t.colour, t.sides, t.variant_code, t.sell_price, t.cost_price, t.is_active, t.catalog_size_code
  FROM public.rate_card_clicks t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND COALESCE(NULLIF(lower(b.catalog_size_code), ''), lower(b.size)) = COALESCE(NULLIF(lower(t.catalog_size_code), ''), lower(t.size))
        AND b.colour = t.colour AND b.sides = t.sides
        AND COALESCE(NULLIF(lower(b.variant_code), ''), '') = COALESCE(NULLIF(lower(t.variant_code), ''), '')
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

  INSERT INTO public.rate_card_canvas_prints
    (scope_type, tenant_id, branch_id, size_slug, size_label, width_mm, height_mm, wrap_mm,
     sell_price, cost_price, sort_order, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id,
         t.size_slug, t.size_label, t.width_mm, t.height_mm, t.wrap_mm,
         t.sell_price, t.cost_price, t.sort_order, t.is_active
  FROM public.rate_card_canvas_prints t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_canvas_prints b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND b.size_slug = t.size_slug AND b.wrap_mm = t.wrap_mm
    );

  INSERT INTO public.rate_card_canvas_wrap_surcharges
    (scope_type, tenant_id, branch_id, wrap_mode, sell_price, cost_price, is_active)
  SELECT 'branch'::rate_card_scope, v_tenant, p_branch_id, t.wrap_mode, t.sell_price, t.cost_price, t.is_active
  FROM public.rate_card_canvas_wrap_surcharges t
  WHERE t.scope_type = 'tenant'::rate_card_scope AND t.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_canvas_wrap_surcharges b
      WHERE b.scope_type = 'branch'::rate_card_scope AND b.branch_id = p_branch_id
        AND b.wrap_mode = t.wrap_mode
    );

  INSERT INTO public.pricing_rules
    (tenant_id, branch_id, product_family_id, name, rule_type, conditions,
     price_value, is_active, sort_order, currency_code)
  SELECT r.tenant_id, p_branch_id, r.product_family_id, r.name, r.rule_type, r.conditions,
         r.price_value, r.is_active, r.sort_order, r.currency_code
  FROM public.pricing_rules r
  WHERE r.tenant_id = v_tenant AND r.branch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pricing_rules b
      WHERE b.branch_id = p_branch_id
        AND b.product_family_id IS NOT DISTINCT FROM r.product_family_id
        AND b.name = r.name
        AND b.rule_type = r.rule_type
        AND b.currency_code = r.currency_code
    );
END;
$function$;
