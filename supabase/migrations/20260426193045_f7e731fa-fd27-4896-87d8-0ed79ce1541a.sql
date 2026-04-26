-- Hide binding options that have no artwork yet from every Binding selector.
-- Idempotent: re-running has no further effect once the labels are gone.
UPDATE public.product_options
SET values = (
  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
  FROM jsonb_array_elements(values) v
  WHERE v->>'label' NOT IN (
    'Spiral Binding (Blue)',
    'Comb Binding (White)',
    'Comb Binding (Navy)'
  )
)
WHERE name ILIKE 'Binding';