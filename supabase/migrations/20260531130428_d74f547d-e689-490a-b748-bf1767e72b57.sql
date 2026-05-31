
-- 1. Table for per-line quantity price breaks across all rate_card_* tables
CREATE TABLE public.rate_card_price_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_table text NOT NULL CHECK (rate_card_table IN ('clicks','papers','finishing','business_cards','photo_prints')),
  rate_card_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('master','tenant','branch')),
  tenant_id uuid NULL,
  branch_id uuid NULL,
  min_quantity integer NOT NULL CHECK (min_quantity >= 1),
  max_quantity integer NULL CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  sell_price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_card_table, rate_card_id, min_quantity)
);

CREATE INDEX idx_rate_card_price_breaks_parent
  ON public.rate_card_price_breaks (rate_card_table, rate_card_id, sort_order);
CREATE INDEX idx_rate_card_price_breaks_scope
  ON public.rate_card_price_breaks (scope_type, tenant_id, branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_card_price_breaks TO authenticated;
GRANT SELECT ON public.rate_card_price_breaks TO anon;
GRANT ALL ON public.rate_card_price_breaks TO service_role;

ALTER TABLE public.rate_card_price_breaks ENABLE ROW LEVEL SECURITY;

-- READ: anyone who can read the parent line can read its breaks
CREATE POLICY rcpb_read ON public.rate_card_price_breaks
FOR SELECT USING (
  scope_type = 'master'
  OR ( current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id() )
  OR ( tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id) )
  OR ( tenant_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tenant_memberships tm
        WHERE tm.profile_id = auth.uid()
          AND tm.tenant_id = rate_card_price_breaks.tenant_id
          AND tm.is_active = true
      ))
);

-- WRITE master: platform_admin only
CREATE POLICY rcpb_master_write ON public.rate_card_price_breaks
FOR ALL USING (
  scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role)
) WITH CHECK (
  scope_type = 'master' AND has_role(auth.uid(), 'platform_admin'::app_role)
);

-- WRITE tenant: tenant admin
CREATE POLICY rcpb_tenant_write ON public.rate_card_price_breaks
FOR ALL USING (
  scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id)
) WITH CHECK (
  scope_type = 'tenant' AND tenant_id IS NOT NULL AND user_is_tenant_admin(tenant_id)
);

-- WRITE branch: tenant admin OR branch manager/store_operator/owner/admin in that branch
CREATE POLICY rcpb_branch_write ON public.rate_card_price_breaks
FOR ALL USING (
  scope_type = 'branch' AND branch_id IS NOT NULL AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_price_breaks.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
) WITH CHECK (
  scope_type = 'branch' AND branch_id IS NOT NULL AND (
    user_is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.is_active = true
        AND tm.branch_id = rate_card_price_breaks.branch_id
        AND tm.role = ANY (ARRAY['branch_manager','store_operator','owner','admin'])
    )
  )
);

-- updated_at trigger
CREATE TRIGGER trg_rcpb_updated_at
BEFORE UPDATE ON public.rate_card_price_breaks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper: seed default 4-tier ladder for one parent line
CREATE OR REPLACE FUNCTION public.seed_default_price_breaks(
  p_table text,
  p_rate_card_id uuid,
  p_scope_type text,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_sell_price numeric,
  p_cost_price numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rate_card_price_breaks
    WHERE rate_card_table = p_table AND rate_card_id = p_rate_card_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.rate_card_price_breaks
    (rate_card_table, rate_card_id, scope_type, tenant_id, branch_id, min_quantity, max_quantity, sell_price, cost_price, sort_order)
  VALUES
    (p_table, p_rate_card_id, p_scope_type, p_tenant_id, p_branch_id, 1,   99,   COALESCE(p_sell_price,0), COALESCE(p_cost_price,0), 0),
    (p_table, p_rate_card_id, p_scope_type, p_tenant_id, p_branch_id, 100, 249,  COALESCE(p_sell_price,0), COALESCE(p_cost_price,0), 1),
    (p_table, p_rate_card_id, p_scope_type, p_tenant_id, p_branch_id, 250, 499,  COALESCE(p_sell_price,0), COALESCE(p_cost_price,0), 2),
    (p_table, p_rate_card_id, p_scope_type, p_tenant_id, p_branch_id, 500, NULL, COALESCE(p_sell_price,0), COALESCE(p_cost_price,0), 3);
END;
$$;

-- 3. AFTER INSERT triggers on each rate_card_* table to auto-seed breaks
CREATE OR REPLACE FUNCTION public.trg_seed_breaks_clicks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_price_breaks('clicks', NEW.id, NEW.scope_type::text, NEW.tenant_id, NEW.branch_id, NEW.sell_price, NEW.cost_price);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.trg_seed_breaks_papers() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_price_breaks('papers', NEW.id, NEW.scope_type::text, NEW.tenant_id, NEW.branch_id, NEW.sell_price, NEW.cost_price);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.trg_seed_breaks_finishing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_price_breaks('finishing', NEW.id, NEW.scope_type::text, NEW.tenant_id, NEW.branch_id, NEW.sell_price, NEW.cost_price);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.trg_seed_breaks_business_cards() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_price_breaks('business_cards', NEW.id, NEW.scope_type::text, NEW.tenant_id, NEW.branch_id, NEW.sell_price, NEW.cost_price);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.trg_seed_breaks_photo_prints() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_price_breaks('photo_prints', NEW.id, NEW.scope_type::text, NEW.tenant_id, NEW.branch_id, NEW.sell_price, NEW.cost_price);
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_rcc_seed_breaks AFTER INSERT ON public.rate_card_clicks
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_breaks_clicks();
CREATE TRIGGER trg_rcp_seed_breaks AFTER INSERT ON public.rate_card_papers
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_breaks_papers();
CREATE TRIGGER trg_rcf_seed_breaks AFTER INSERT ON public.rate_card_finishing
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_breaks_finishing();
CREATE TRIGGER trg_rcbc_seed_breaks AFTER INSERT ON public.rate_card_business_cards
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_breaks_business_cards();
CREATE TRIGGER trg_rcpp_seed_breaks AFTER INSERT ON public.rate_card_photo_prints
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_breaks_photo_prints();

-- 4. Cascade DELETE: when a parent line is deleted, its breaks go too
CREATE OR REPLACE FUNCTION public.trg_cleanup_breaks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table text;
BEGIN
  v_table := CASE TG_TABLE_NAME
    WHEN 'rate_card_clicks' THEN 'clicks'
    WHEN 'rate_card_papers' THEN 'papers'
    WHEN 'rate_card_finishing' THEN 'finishing'
    WHEN 'rate_card_business_cards' THEN 'business_cards'
    WHEN 'rate_card_photo_prints' THEN 'photo_prints'
  END;
  DELETE FROM public.rate_card_price_breaks
   WHERE rate_card_table = v_table AND rate_card_id = OLD.id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_rcc_cleanup_breaks AFTER DELETE ON public.rate_card_clicks
FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_breaks();
CREATE TRIGGER trg_rcp_cleanup_breaks AFTER DELETE ON public.rate_card_papers
FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_breaks();
CREATE TRIGGER trg_rcf_cleanup_breaks AFTER DELETE ON public.rate_card_finishing
FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_breaks();
CREATE TRIGGER trg_rcbc_cleanup_breaks AFTER DELETE ON public.rate_card_business_cards
FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_breaks();
CREATE TRIGGER trg_rcpp_cleanup_breaks AFTER DELETE ON public.rate_card_photo_prints
FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_breaks();

-- 5. Backfill: for every existing rate_card_* row with no breaks, seed defaults
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, scope_type::text AS st, tenant_id, branch_id, sell_price, cost_price FROM public.rate_card_clicks LOOP
    PERFORM public.seed_default_price_breaks('clicks', r.id, r.st, r.tenant_id, r.branch_id, r.sell_price, r.cost_price);
  END LOOP;
  FOR r IN SELECT id, scope_type::text AS st, tenant_id, branch_id, sell_price, cost_price FROM public.rate_card_papers LOOP
    PERFORM public.seed_default_price_breaks('papers', r.id, r.st, r.tenant_id, r.branch_id, r.sell_price, r.cost_price);
  END LOOP;
  FOR r IN SELECT id, scope_type::text AS st, tenant_id, branch_id, sell_price, cost_price FROM public.rate_card_finishing LOOP
    PERFORM public.seed_default_price_breaks('finishing', r.id, r.st, r.tenant_id, r.branch_id, r.sell_price, r.cost_price);
  END LOOP;
  FOR r IN SELECT id, scope_type::text AS st, tenant_id, branch_id, sell_price, cost_price FROM public.rate_card_business_cards LOOP
    PERFORM public.seed_default_price_breaks('business_cards', r.id, r.st, r.tenant_id, r.branch_id, r.sell_price, r.cost_price);
  END LOOP;
  FOR r IN SELECT id, scope_type::text AS st, tenant_id, branch_id, sell_price, cost_price FROM public.rate_card_photo_prints LOOP
    PERFORM public.seed_default_price_breaks('photo_prints', r.id, r.st, r.tenant_id, r.branch_id, r.sell_price, r.cost_price);
  END LOOP;
END;$$;
