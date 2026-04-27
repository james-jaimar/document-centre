-- Remove the "Twin Loop Wire (White)" binding option from all Binding product_options
-- because there is no white-wire artwork in the binding asset registry.
-- This stops the configurator from offering a choice that would render with
-- the wrong colour spine artwork.
UPDATE public.product_options
SET values = (
  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
  FROM jsonb_array_elements(values) AS v
  WHERE NOT (
    (v->'metadata'->>'binding_method' = 'twin_loop')
    AND (lower(coalesce(v->'metadata'->>'color', '')) = 'white')
  )
)
WHERE lower(name) = 'binding';