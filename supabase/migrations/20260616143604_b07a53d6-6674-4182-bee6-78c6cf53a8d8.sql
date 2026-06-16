-- D1 cover catalogue fix: reactivate the priced component cover rows and add
-- explicit prices for every combo cover code so the pricing engine bills them.

-- 1) Reactivate the underlying priced cover rows
UPDATE public.catalog_finishing
SET is_active = true
WHERE scope_type = 'master'
  AND category = 'cover'
  AND code IN (
    'acetate-cover','card-back','card-back-black','card-back-navy',
    'card-cover-160','card-cover-250','card-cover-300',
    'gloss-cover-250','silk-cover-250',
    'frosted-pvc-cover','matte-pvc-cover'
  );

-- 2) Make sure every combo cover row carries a pricing_basis (per_sheet so the
--    engine multiplies by sheet count of the cover — i.e. once per book)
UPDATE public.catalog_finishing
SET pricing_basis = COALESCE(pricing_basis, 'per_unit')
WHERE scope_type = 'master'
  AND category = 'cover'
  AND code IN (
    'clear-front-black-back','clear-front-navy-back','clear-front-white-back',
    'matte-front-black-back','matte-front-white-back',
    'frosted-front-black-back','frosted-front-white-back',
    'white-card-160','white-card-250','white-card-300',
    'silk-card-250','gloss-card-250',
    'printed-cover-body','printed-cover-silk-250','printed-cover-gloss-250',
    'printed-cover-silk-300','printed-cover-gloss-300','cover-none'
  );

-- 3) Add A4 + A3 prices (sell_price_minor, in cents) for the combo cover rows.
--    Values are component-sum estimates derived from the existing acetate /
--    matte-pvc / frosted-pvc / card-back rate-card prices. Admins can refine
--    them in Master Catalogue → Covers.

WITH combo_prices(code, size_code, sell_price_minor) AS (
  VALUES
    ('cover-none','a4', 0), ('cover-none','a3', 0),
    -- Clear PVC front (~600c A4 / 1200c A3) + card back
    ('clear-front-white-back','a4', 850),  ('clear-front-white-back','a3', 1700),
    ('clear-front-black-back','a4', 950),  ('clear-front-black-back','a3', 1900),
    ('clear-front-navy-back', 'a4', 950),  ('clear-front-navy-back', 'a3', 1900),
    -- Matte PVC front (~450c A4) + card back
    ('matte-front-white-back','a4', 700),  ('matte-front-white-back','a3', 1400),
    ('matte-front-black-back','a4', 800),  ('matte-front-black-back','a3', 1600),
    -- Frosted PVC front (~550c A4) + card back
    ('frosted-front-white-back','a4', 800),  ('frosted-front-white-back','a3', 1600),
    ('frosted-front-black-back','a4', 900),  ('frosted-front-black-back','a3', 1800),
    -- Plain card front & back (2x the single-side card cover price)
    ('white-card-160','a4', 440), ('white-card-160','a3', 880),
    ('white-card-250','a4', 580), ('white-card-250','a3', 1150),
    ('white-card-300','a4', 650), ('white-card-300','a3', 1300),
    ('silk-card-250', 'a4', 600), ('silk-card-250', 'a3', 1200),
    ('gloss-card-250','a4', 680), ('gloss-card-250','a3', 1250),
    -- Printed covers (customer prints; cost = cover stock only)
    ('printed-cover-body',     'a4',   0), ('printed-cover-body',     'a3',   0),
    ('printed-cover-silk-250', 'a4', 600), ('printed-cover-silk-250', 'a3', 1200),
    ('printed-cover-gloss-250','a4', 680), ('printed-cover-gloss-250','a3', 1250),
    ('printed-cover-silk-300', 'a4', 700), ('printed-cover-silk-300', 'a3', 1400),
    ('printed-cover-gloss-300','a4', 750), ('printed-cover-gloss-300','a3', 1500)
)
INSERT INTO public.catalog_finishing_prices
  (finishing_id, size_code, sell_price_minor, cost_price_minor, is_active, scope_type, tenant_id, branch_id)
SELECT cf.id, cp.size_code, cp.sell_price_minor, NULL, true, 'master', NULL, NULL
FROM combo_prices cp
JOIN public.catalog_finishing cf
  ON cf.code = cp.code AND cf.scope_type='master' AND cf.category='cover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_finishing_prices fp
  WHERE fp.finishing_id = cf.id AND fp.size_code = cp.size_code AND fp.scope_type='master'
);