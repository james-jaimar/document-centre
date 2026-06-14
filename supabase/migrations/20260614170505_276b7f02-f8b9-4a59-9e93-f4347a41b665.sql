
-- 1. Update stocked_sizes to reflect real-world availability
UPDATE public.catalog_papers SET stocked_sizes = ARRAY['a4','a3'] WHERE scope_type='master' AND code IN ('photo-gloss','photo-matt');
UPDATE public.catalog_papers SET stocked_sizes = ARRAY['a3','a2','a1','a0'] WHERE scope_type='master' AND code IN ('poster-paper-bond','photo-poster-gloss','premium-poster-paper-gloss','premium-poster-paper');
UPDATE public.catalog_papers SET stocked_sizes = ARRAY['a4','a3'] WHERE scope_type='master' AND code IN ('170gsm-silk');
UPDATE public.catalog_papers SET stocked_sizes = ARRAY['a4','a3','sra3'] WHERE scope_type='master' AND code IN ('200gsm-gloss','250gsm-gloss','250gsm-silk','300gsm-silk','350gsm-gloss','350gsm-matt');

-- 2. Deactivate duplicate cover finishing items (covers are now paper stocks)
UPDATE public.catalog_finishing SET is_active = false WHERE scope_type='master' AND category = 'cover';

-- 3. Seed placeholder paper price rows for every (active paper × stocked size) with no row
INSERT INTO public.catalog_paper_prices (scope_type, paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
SELECT 'master', p.id, sz, 0, 0, true
FROM public.catalog_papers p
CROSS JOIN LATERAL unnest(coalesce(p.stocked_sizes, ARRAY[]::text[])) AS sz
WHERE p.scope_type='master' AND p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.catalog_paper_prices pp
    WHERE pp.scope_type='master' AND pp.paper_id = p.id AND pp.size_code = sz
  );

-- 4. Seed placeholder finishing prices for every active item with no price row.
--    per_sheet items → a4 + a3 placeholders; everything else → 'any'.
INSERT INTO public.catalog_finishing_prices (scope_type, finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
SELECT 'master', f.id,
       CASE WHEN f.pricing_basis = 'per_sheet' THEN sz ELSE 'any' END,
       0, 0, true
FROM public.catalog_finishing f
CROSS JOIN LATERAL (
  SELECT unnest(CASE WHEN f.pricing_basis = 'per_sheet' THEN ARRAY['a4','a3'] ELSE ARRAY['any'] END) AS sz
) s
WHERE f.scope_type='master' AND f.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.catalog_finishing_prices fp
    WHERE fp.scope_type='master' AND fp.finishing_id = f.id
      AND fp.size_code = CASE WHEN f.pricing_basis = 'per_sheet' THEN s.sz ELSE 'any' END
  );

-- 5. Drop the legacy rate-card paper & finishing tables (and their price breaks).
DELETE FROM public.rate_card_price_breaks WHERE rate_card_table IN ('papers','finishing');
DROP TABLE IF EXISTS public.rate_card_papers CASCADE;
DROP TABLE IF EXISTS public.rate_card_finishing CASCADE;

-- 6. Rewrite the tenant-clone RPC to only handle clicks / photo / business cards.
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.rate_card_clicks
    (scope_type, tenant_id, size, colour, sides, sell_price, cost_price, is_active, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.size, m.colour, m.sides, m.sell_price, m.cost_price, m.is_active, m.catalog_size_code
  FROM public.rate_card_clicks m
  WHERE m.scope_type = 'master'
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_clicks t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
        AND t.size = m.size AND t.colour = m.colour AND t.sides = m.sides
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
