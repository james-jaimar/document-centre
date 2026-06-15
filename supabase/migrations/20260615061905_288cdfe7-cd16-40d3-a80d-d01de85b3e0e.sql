
ALTER TABLE public.catalog_finishing
  ADD COLUMN IF NOT EXISTS binding_method text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS size_mm integer,
  ADD COLUMN IF NOT EXISTS max_sheets integer;

-- Back-fill: parse method + size from existing binding codes.
UPDATE public.catalog_finishing
SET
  binding_method = CASE
    WHEN code LIKE 'spiral-%'      THEN 'spiral'
    WHEN code LIKE 'comb-%'        THEN 'comb'
    WHEN code LIKE 'ring-binder-%' THEN 'ring_binder'
    WHEN code LIKE 'wire-%' AND label ILIKE '%twin%loop%' THEN 'twin_loop'
    WHEN code LIKE 'wire-%'        THEN 'twin_loop'
    WHEN code ILIKE '%saddle%'     THEN 'saddle_stitch'
    WHEN code ILIKE '%perfect%'    THEN 'perfect'
    ELSE binding_method
  END,
  size_mm = COALESCE(
    size_mm,
    NULLIF(regexp_replace(code, '^.*-(\d+)mm$', '\1'), code)::int
  ),
  color = COALESCE(color, 'Black')
WHERE category = 'binding';
