
-- 1) Add FK columns to rate_card_papers
ALTER TABLE public.rate_card_papers
  ADD COLUMN IF NOT EXISTS catalog_paper_id uuid REFERENCES public.catalog_papers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_size_code text REFERENCES public.catalog_sizes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rate_card_papers_catalog_paper_id ON public.rate_card_papers(catalog_paper_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_papers_catalog_size_code ON public.rate_card_papers(catalog_size_code);

-- Backfill size code (lowercase match)
UPDATE public.rate_card_papers r
SET catalog_size_code = s.code
FROM public.catalog_sizes s
WHERE r.catalog_size_code IS NULL
  AND s.code = lower(r.size);

-- Backfill catalog_paper_id by stripping trailing -<size> from code and matching catalog_papers.code
UPDATE public.rate_card_papers r
SET catalog_paper_id = c.id
FROM public.catalog_papers c
WHERE r.catalog_paper_id IS NULL
  AND c.code = regexp_replace(r.code, '-[a-z0-9]+$', '');

-- Secondary backfill via (weight_gsm, finish) when code-strip didn't match
UPDATE public.rate_card_papers r
SET catalog_paper_id = c.id
FROM public.catalog_papers c
WHERE r.catalog_paper_id IS NULL
  AND r.weight_gsm IS NOT NULL
  AND c.weight_gsm = r.weight_gsm
  AND lower(coalesce(c.finish,'')) = lower(coalesce(r.finish,''))
  -- Prefer the catalogue label that matches the rate-card label minus trailing size
  AND lower(c.label) = lower(trim(regexp_replace(r.label, '\s+(A0|A1|A2|A3|A4|A5|A6|SRA3|DL|US Letter|US Legal|Tabloid)\s*$', '', 'i')));

-- 2) Add FK columns to rate_card_finishing
ALTER TABLE public.rate_card_finishing
  ADD COLUMN IF NOT EXISTS catalog_finishing_id uuid REFERENCES public.catalog_finishing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_size_code text REFERENCES public.catalog_sizes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rate_card_finishing_catalog_finishing_id ON public.rate_card_finishing(catalog_finishing_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_finishing_catalog_size_code ON public.rate_card_finishing(catalog_size_code);

UPDATE public.rate_card_finishing r
SET catalog_size_code = coalesce(s.code, 'any')
FROM (SELECT code FROM public.catalog_sizes) s
WHERE r.catalog_size_code IS NULL
  AND s.code = lower(coalesce(r.size,''));

-- Fall back to 'any' where size is null/empty
UPDATE public.rate_card_finishing r
SET catalog_size_code = 'any'
WHERE r.catalog_size_code IS NULL;

UPDATE public.rate_card_finishing r
SET catalog_finishing_id = c.id
FROM public.catalog_finishing c
WHERE r.catalog_finishing_id IS NULL
  AND c.code = regexp_replace(r.code, '-(a0|a1|a2|a3|a4|a5|a6|sra3|dl)$', '');

UPDATE public.rate_card_finishing r
SET catalog_finishing_id = c.id
FROM public.catalog_finishing c
WHERE r.catalog_finishing_id IS NULL
  AND c.code = r.code;

-- 3) Add FK column to rate_card_clicks
ALTER TABLE public.rate_card_clicks
  ADD COLUMN IF NOT EXISTS catalog_size_code text REFERENCES public.catalog_sizes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rate_card_clicks_catalog_size_code ON public.rate_card_clicks(catalog_size_code);

UPDATE public.rate_card_clicks r
SET catalog_size_code = s.code
FROM public.catalog_sizes s
WHERE r.catalog_size_code IS NULL
  AND s.code = lower(r.size);

-- 4) Rewrite clone function: pull from catalogue first, fall back to legacy master rate-card rows
CREATE OR REPLACE FUNCTION public.clone_master_rate_card_to_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Clicks: catalogue sizes × master click rows (one per catalogue size that has a matching master row)
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

  -- Papers: prefer catalogue (one tenant row per catalog_paper × catalog_size price)
  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, code, label, weight_gsm, finish, size,
     sell_price, cost_price, sort_order, is_active,
     catalog_paper_id, catalog_size_code)
  SELECT 'tenant', p_tenant_id,
         c.code || '-' || pp.size_code,
         c.label || ' ' || coalesce(upper(s.code), ''),
         c.weight_gsm, c.finish, upper(coalesce(s.code,'')),
         (pp.sell_price_minor / 100.0)::numeric, (coalesce(pp.cost_price_minor,0) / 100.0)::numeric,
         c.sort_order, c.is_active AND pp.is_active,
         c.id, pp.size_code
  FROM public.catalog_paper_prices pp
  JOIN public.catalog_papers c ON c.id = pp.paper_id
  LEFT JOIN public.catalog_sizes s ON s.code = pp.size_code
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rate_card_papers t
    WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
      AND t.catalog_paper_id = c.id
      AND coalesce(t.catalog_size_code,'') = coalesce(pp.size_code,'')
  );

  -- Legacy master rate-card papers (only for items NOT yet represented in the catalogue)
  INSERT INTO public.rate_card_papers
    (scope_type, tenant_id, code, label, weight_gsm, finish, size,
     sell_price, cost_price, sort_order, is_active,
     catalog_paper_id, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.weight_gsm, m.finish, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active,
         m.catalog_paper_id, m.catalog_size_code
  FROM public.rate_card_papers m
  WHERE m.scope_type = 'master'
    AND m.catalog_paper_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_papers t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  -- Finishing: prefer catalogue
  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, code, label, category, pricing_basis, variant, size,
     sell_price, cost_price, sort_order, is_active,
     catalog_finishing_id, catalog_size_code)
  SELECT 'tenant', p_tenant_id,
         c.code || CASE WHEN fp.size_code IS NOT NULL AND fp.size_code <> 'any' THEN '-' || fp.size_code ELSE '' END,
         c.label || CASE WHEN fp.size_code IS NOT NULL AND fp.size_code <> 'any' THEN ' ' || upper(fp.size_code) ELSE '' END,
         c.category, c.pricing_basis, c.variant,
         CASE WHEN fp.size_code = 'any' OR fp.size_code IS NULL THEN NULL ELSE upper(fp.size_code) END,
         (fp.sell_price_minor / 100.0)::numeric, (coalesce(fp.cost_price_minor,0) / 100.0)::numeric,
         c.sort_order, c.is_active AND fp.is_active,
         c.id, coalesce(fp.size_code, 'any')
  FROM public.catalog_finishing_prices fp
  JOIN public.catalog_finishing c ON c.id = fp.finishing_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rate_card_finishing t
    WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id
      AND t.catalog_finishing_id = c.id
      AND coalesce(t.catalog_size_code,'any') = coalesce(fp.size_code,'any')
  );

  -- Legacy master rate-card finishing (only for items NOT yet in the catalogue)
  INSERT INTO public.rate_card_finishing
    (scope_type, tenant_id, code, label, category, pricing_basis, variant, size,
     sell_price, cost_price, sort_order, is_active,
     catalog_finishing_id, catalog_size_code)
  SELECT 'tenant', p_tenant_id, m.code, m.label, m.category, m.pricing_basis, m.variant, m.size,
         m.sell_price, m.cost_price, m.sort_order, m.is_active,
         m.catalog_finishing_id, m.catalog_size_code
  FROM public.rate_card_finishing m
  WHERE m.scope_type = 'master'
    AND m.catalog_finishing_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.rate_card_finishing t
      WHERE t.scope_type = 'tenant' AND t.tenant_id = p_tenant_id AND t.code = m.code
    );

  -- Photo prints & business cards: unchanged from before
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
