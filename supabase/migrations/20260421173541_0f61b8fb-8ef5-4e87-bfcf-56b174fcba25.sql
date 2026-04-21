-- Seed Business Cards product family at the app level (tenant_id = NULL)
-- Idempotent: only inserts if business-cards slug doesn't already exist.

DO $$
DECLARE
  v_family_id uuid;
BEGIN
  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM public.product_families WHERE slug = 'business-cards' AND tenant_id IS NULL) THEN
    RAISE NOTICE 'Business Cards already seeded — skipping.';
    RETURN;
  END IF;

  INSERT INTO public.product_families (name, slug, description, icon, sort_order, is_active, tenant_id)
  VALUES (
    'Business Cards',
    'business-cards',
    'Premium business cards in standard 90×50mm (UK/AU/ZA), US 88.9×50.8mm, and European 85.6×54mm sizes. Sold in packs from 50 to 2,500 with a full range of card stocks, lamination, foil, spot UV, embossing and letterpress finishes.',
    'CreditCard',
    8,
    true,
    NULL
  )
  RETURNING id INTO v_family_id;

  -- Document Size
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Document Size', 'select', true, 0, '[
    {"label":"Standard (90 × 50 mm)","slug":"standard-90-x-50-mm","group":"Standard Sizes","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{"width_mm":90,"height_mm":50,"region":"UK / AU / ZA"}},
    {"label":"US Standard (88.9 × 50.8 mm)","slug":"us-standard-88-9-x-50-8-mm","group":"Standard Sizes","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"width_mm":88.9,"height_mm":50.8,"region":"US / CA","inches":"3.5 × 2"}},
    {"label":"European ISO (85.6 × 54 mm)","slug":"european-iso-85-6-x-54-mm","group":"Standard Sizes","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"width_mm":85.6,"height_mm":53.98,"region":"EU","iso":"7810 ID-1"}},
    {"label":"Square (55 × 55 mm)","slug":"square-55-x-55-mm","group":"Specialty Sizes","price_impact":5,"price_type":"per_document","is_default":false,"metadata":{"width_mm":55,"height_mm":55,"shape":"square"}},
    {"label":"Folded (90 × 100 mm flat → 90 × 50 mm)","slug":"folded-90-x-100-mm-flat-90-x-50-mm","group":"Specialty Sizes","price_impact":8,"price_type":"per_document","is_default":false,"metadata":{"width_mm":90,"height_mm":50,"flat_height_mm":100,"folded":true}}
  ]'::jsonb);

  -- Pack Size
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Pack Size', 'select', true, 1, '[
    {"label":"Pack of 50","slug":"pack-of-50","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"quantity":50}},
    {"label":"Pack of 100","slug":"pack-of-100","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{"quantity":100}},
    {"label":"Pack of 250","slug":"pack-of-250","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"quantity":250}},
    {"label":"Pack of 500","slug":"pack-of-500","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"quantity":500}},
    {"label":"Pack of 1000","slug":"pack-of-1000","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"quantity":1000}},
    {"label":"Pack of 2500","slug":"pack-of-2500","group":"Pack Size","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"quantity":2500}}
  ]'::jsonb);

  -- Paper Stock
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Paper Stock', 'select', true, 2, '[
    {"label":"300gsm Silk","slug":"300gsm-silk","group":"Standard Card","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{"weight_gsm":300,"finish":"silk"}},
    {"label":"350gsm Silk","slug":"350gsm-silk","group":"Standard Card","price_impact":5,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":350,"finish":"silk"}},
    {"label":"300gsm Gloss","slug":"300gsm-gloss","group":"Standard Card","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":300,"finish":"gloss"}},
    {"label":"350gsm Gloss","slug":"350gsm-gloss","group":"Standard Card","price_impact":5,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":350,"finish":"gloss"}},
    {"label":"350gsm Uncoated","slug":"350gsm-uncoated","group":"Premium Card","price_impact":8,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":350,"finish":"uncoated"}},
    {"label":"400gsm Uncoated","slug":"400gsm-uncoated","group":"Premium Card","price_impact":12,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":400,"finish":"uncoated"}},
    {"label":"450gsm Recycled Kraft","slug":"450gsm-recycled-kraft","group":"Premium Card","price_impact":15,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":450,"finish":"kraft","recycled":true}},
    {"label":"540gsm Triplex (Black Core)","slug":"540gsm-triplex-black-core","group":"Luxury Card","price_impact":35,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":540,"finish":"triplex","core_color":"black"}},
    {"label":"600gsm Cotton","slug":"600gsm-cotton","group":"Luxury Card","price_impact":45,"price_type":"per_document","is_default":false,"metadata":{"weight_gsm":600,"finish":"cotton"}}
  ]'::jsonb);

  -- Print Sides
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Print Sides', 'select', true, 3, '[
    {"label":"Single-Sided","slug":"single-sided","group":"Print Sides","price_impact":0,"price_type":"per_document","is_default":false,"metadata":{"is_duplex":false}},
    {"label":"Double-Sided","slug":"double-sided","group":"Print Sides","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{"is_duplex":true}}
  ]'::jsonb);

  -- Corner Style
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Corner Style', 'select', false, 4, '[
    {"label":"Square Corners","slug":"square-corners","group":"Corner Style","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{"shape":"square"}},
    {"label":"Rounded Corners (3mm radius)","slug":"rounded-corners-3mm-radius","group":"Corner Style","price_impact":6,"price_type":"per_document","is_default":false,"metadata":{"shape":"rounded","radius_mm":3}},
    {"label":"Rounded Corners (6mm radius)","slug":"rounded-corners-6mm-radius","group":"Corner Style","price_impact":6,"price_type":"per_document","is_default":false,"metadata":{"shape":"rounded","radius_mm":6}}
  ]'::jsonb);

  -- Lamination
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Lamination', 'select', false, 5, '[
    {"label":"None","slug":"none","group":"Lamination","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{}},
    {"label":"Matt Lamination","slug":"matt-lamination","group":"Lamination","price_impact":8,"price_type":"per_document","is_default":false,"metadata":{"finish":"matt","both_sides":true}},
    {"label":"Gloss Lamination","slug":"gloss-lamination","group":"Lamination","price_impact":8,"price_type":"per_document","is_default":false,"metadata":{"finish":"gloss","both_sides":true}},
    {"label":"Soft-Touch Lamination","slug":"soft-touch-lamination","group":"Lamination","price_impact":18,"price_type":"per_document","is_default":false,"metadata":{"finish":"soft_touch","both_sides":true}}
  ]'::jsonb);

  -- Special Finishing
  INSERT INTO public.product_options (product_family_id, name, option_type, is_required, sort_order, values) VALUES
  (v_family_id, 'Special Finishing', 'select', false, 6, '[
    {"label":"None","slug":"none","group":"Special Finishing","price_impact":0,"price_type":"per_document","is_default":true,"metadata":{}},
    {"label":"Spot UV (Front)","slug":"spot-uv-front","group":"Special Finishing","price_impact":25,"price_type":"per_document","is_default":false,"metadata":{"finish":"spot_uv","side":"front"}},
    {"label":"Spot UV (Both Sides)","slug":"spot-uv-both-sides","group":"Special Finishing","price_impact":40,"price_type":"per_document","is_default":false,"metadata":{"finish":"spot_uv","both_sides":true}},
    {"label":"Foil Stamping (Gold)","slug":"foil-stamping-gold","group":"Special Finishing","price_impact":55,"price_type":"per_document","is_default":false,"metadata":{"finish":"foil","color":"gold"}},
    {"label":"Foil Stamping (Silver)","slug":"foil-stamping-silver","group":"Special Finishing","price_impact":55,"price_type":"per_document","is_default":false,"metadata":{"finish":"foil","color":"silver"}},
    {"label":"Foil Stamping (Rose Gold)","slug":"foil-stamping-rose-gold","group":"Special Finishing","price_impact":65,"price_type":"per_document","is_default":false,"metadata":{"finish":"foil","color":"rose_gold"}},
    {"label":"Embossed","slug":"embossed","group":"Special Finishing","price_impact":50,"price_type":"per_document","is_default":false,"metadata":{"finish":"emboss"}},
    {"label":"Letterpress (1 colour)","slug":"letterpress-1-colour","group":"Special Finishing","price_impact":75,"price_type":"per_document","is_default":false,"metadata":{"finish":"letterpress","colors":1}}
  ]'::jsonb);

  -- Pricing rules
  INSERT INTO public.pricing_rules (product_family_id, name, rule_type, price_value, conditions, sort_order, is_active) VALUES
  (v_family_id, 'Pack of 50 Base Rate',   'per_document', 95.0,   '{"pack_size":50}'::jsonb,   0, true),
  (v_family_id, 'Pack of 100 Base Rate',  'per_document', 145.0,  '{"pack_size":100}'::jsonb,  1, true),
  (v_family_id, 'Pack of 250 Base Rate',  'per_document', 285.0,  '{"pack_size":250}'::jsonb,  2, true),
  (v_family_id, 'Pack of 500 Base Rate',  'per_document', 475.0,  '{"pack_size":500}'::jsonb,  3, true),
  (v_family_id, 'Pack of 1000 Base Rate', 'per_document', 795.0,  '{"pack_size":1000}'::jsonb, 4, true),
  (v_family_id, 'Pack of 2500 Base Rate', 'per_document', 1695.0, '{"pack_size":2500}'::jsonb, 5, true),
  (v_family_id, 'Multi-Pack Discount 5+',  'surcharge',  -0.05, '{"min_quantity":5}'::jsonb,  6, true),
  (v_family_id, 'Multi-Pack Discount 10+', 'surcharge',  -0.10, '{"min_quantity":10}'::jsonb, 7, true);

  RAISE NOTICE 'Business Cards seeded with id %', v_family_id;
END $$;