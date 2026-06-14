
ALTER TABLE catalog_finishing_prices
  ADD CONSTRAINT catalog_finishing_prices_finishing_id_size_code_key
  UNIQUE (finishing_id, size_code);

INSERT INTO catalog_sizes (code, label, width_mm, height_mm, sort_order, is_active)
VALUES ('any', 'Any size', 0, 0, 9999, false)
ON CONFLICT (code) DO NOTHING;

WITH src AS (
  SELECT
    btrim(regexp_replace(label, '\s*(SRA3|A[0-6]|DL)(\s+Landscape)?\s*$', '', 'i')) AS clean_label,
    weight_gsm,
    lower(coalesce(finish, '')) AS finish_lc,
    finish AS finish_orig,
    sort_order
  FROM rate_card_papers
  WHERE scope_type = 'master' AND is_active = true
), grouped AS (
  SELECT clean_label, weight_gsm, finish_lc,
    min(finish_orig) AS finish_orig, min(sort_order) AS sort_order
  FROM src GROUP BY clean_label, weight_gsm, finish_lc
)
INSERT INTO catalog_papers (code, label, weight_gsm, finish, category, sort_order, is_active)
SELECT
  trim(both '-' FROM lower(regexp_replace(clean_label, '[^a-zA-Z0-9]+', '-', 'g'))),
  clean_label, weight_gsm, finish_orig,
  CASE
    WHEN finish_lc LIKE '%pastel%' OR finish_lc LIKE '%colour%' OR finish_lc LIKE '%color%' THEN 'coloured'
    WHEN finish_lc LIKE '%recycled%' THEN 'recycled'
    WHEN weight_gsm >= 170 THEN 'cover'
    ELSE 'text'
  END,
  sort_order, true
FROM grouped
ON CONFLICT (code) DO NOTHING;

WITH src AS (
  SELECT
    trim(both '-' FROM lower(regexp_replace(
      btrim(regexp_replace(label, '\s*(SRA3|A[0-6]|DL)(\s+Landscape)?\s*$', '', 'i')),
      '[^a-zA-Z0-9]+', '-', 'g'))) AS paper_code,
    lower(btrim(size)) AS size_code,
    sell_price, cost_price
  FROM rate_card_papers
  WHERE scope_type = 'master' AND is_active = true AND size IS NOT NULL
), dedup AS (
  SELECT paper_code, size_code,
    avg(sell_price) AS sell_price, avg(cost_price) AS cost_price
  FROM src GROUP BY paper_code, size_code
)
INSERT INTO catalog_paper_prices (paper_id, size_code, sell_price_minor, cost_price_minor, is_active)
SELECT p.id, s.size_code,
  round(s.sell_price * 100)::int,
  round(coalesce(s.cost_price, 0) * 100)::int,
  true
FROM dedup s
JOIN catalog_papers p ON p.code = s.paper_code
JOIN catalog_sizes cs ON cs.code = s.size_code
ON CONFLICT (paper_id, size_code) DO NOTHING;

WITH src AS (
  SELECT
    btrim(regexp_replace(label, '\s*(SRA3|A[0-6]|DL)(\s+Landscape)?\s*$', '', 'i')) AS clean_label,
    trim(both '-' FROM regexp_replace(code, '(^|-)(a[0-6]|sra3|dl)(-|$)', '\1\3', 'gi')) AS clean_code,
    category, variant, pricing_basis, sort_order
  FROM rate_card_finishing
  WHERE scope_type = 'master' AND is_active = true
), grouped AS (
  SELECT clean_code,
    min(clean_label) AS label,
    min(category) AS category,
    min(variant) AS variant,
    min(pricing_basis) AS pricing_basis,
    min(sort_order) AS sort_order
  FROM src GROUP BY clean_code
)
INSERT INTO catalog_finishing (code, label, category, variant, pricing_basis, sort_order, is_active)
SELECT clean_code, label, category, variant, pricing_basis, sort_order, true
FROM grouped
ON CONFLICT (code) DO NOTHING;

WITH src AS (
  SELECT
    trim(both '-' FROM regexp_replace(code, '(^|-)(a[0-6]|sra3|dl)(-|$)', '\1\3', 'gi')) AS clean_code,
    coalesce(lower(btrim(size)), 'any') AS size_code,
    sell_price, cost_price
  FROM rate_card_finishing
  WHERE scope_type = 'master' AND is_active = true
), dedup AS (
  SELECT clean_code, size_code,
    avg(sell_price) AS sell_price, avg(cost_price) AS cost_price
  FROM src GROUP BY clean_code, size_code
)
INSERT INTO catalog_finishing_prices (finishing_id, size_code, sell_price_minor, cost_price_minor, is_active)
SELECT f.id, s.size_code,
  round(s.sell_price * 100)::int,
  round(coalesce(s.cost_price, 0) * 100)::int,
  true
FROM dedup s
JOIN catalog_finishing f ON f.code = s.clean_code
JOIN catalog_sizes cs ON cs.code = s.size_code
ON CONFLICT (finishing_id, size_code) DO NOTHING;
