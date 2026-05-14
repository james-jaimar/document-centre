-- Photo Prints are 100% rate-card driven. Remove duplicate price/size definitions.

-- 1) Delete all pricing_rules for photo-prints family (master + tenant copies)
DELETE FROM public.pricing_rules
WHERE product_family_id IN (
  SELECT id FROM public.product_families WHERE slug = 'photo-prints'
);

-- 2) Strip the 'a4' value from the Print Size product_options (and any other sizes
-- that aren't supplied by the rate card metadata map).
UPDATE public.product_options po
SET values = (
  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
  FROM jsonb_array_elements(po.values) v
  WHERE (v->>'slug') <> 'a4'
)
WHERE po.product_family_id IN (
  SELECT id FROM public.product_families WHERE slug = 'photo-prints'
)
AND po.name = 'Print Size';