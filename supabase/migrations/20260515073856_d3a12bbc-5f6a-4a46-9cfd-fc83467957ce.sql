CREATE TABLE public.rate_card_business_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('master','tenant')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  quantity integer NOT NULL,
  sides text NOT NULL DEFAULT 'double' CHECK (sides IN ('single','double')),
  paper text NOT NULL DEFAULT '350gsm Silk',
  finish text NOT NULL DEFAULT 'none',
  sell_price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_business_cards_scope_chk CHECK (
    (scope_type = 'master' AND tenant_id IS NULL)
    OR (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX rate_card_business_cards_master_code_uniq
  ON public.rate_card_business_cards (code)
  WHERE scope_type = 'master';

CREATE UNIQUE INDEX rate_card_business_cards_tenant_code_uniq
  ON public.rate_card_business_cards (tenant_id, code)
  WHERE scope_type = 'tenant';

ALTER TABLE public.rate_card_business_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read master business card pricing"
ON public.rate_card_business_cards FOR SELECT
USING (scope_type = 'master');

CREATE POLICY "Tenant members can read their business card pricing"
ON public.rate_card_business_cards FOR SELECT
USING (
  scope_type = 'tenant'
  AND tenant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = auth.uid()
      AND tm.tenant_id = rate_card_business_cards.tenant_id
      AND tm.is_active = true
  )
);

CREATE POLICY "Platform admins manage master business card pricing"
ON public.rate_card_business_cards FOR ALL
USING (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (scope_type = 'master' AND public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "Tenant admins manage their business card pricing"
ON public.rate_card_business_cards FOR ALL
USING (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
WITH CHECK (scope_type = 'tenant' AND tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id));

CREATE TRIGGER set_rate_card_business_cards_updated_at
BEFORE UPDATE ON public.rate_card_business_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend the master->tenant clone function to include business cards
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, sell_price, cost_price, is_active)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.sell_price, m.cost_price, m.is_active
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND t.size = m.size AND t.colour = m.colour AND t.sides = m.sides
    );

  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, code, label, weight_gsm, finish, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_papers m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_papers t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, code, label, category, pricing_basis, variant, size, sell_price, cost_price, sort_order, is_active)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.pricing_basis, m.variant, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active
  FROM public.rate_card_finishing m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_finishing t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
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
END;
$function$;