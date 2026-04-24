ALTER TABLE public.product_families
  ADD COLUMN color_output text NOT NULL DEFAULT 'cmyk'
    CHECK (color_output IN ('cmyk', 'rgb')),
  ADD COLUMN cmyk_profile text NOT NULL DEFAULT 'fogra39',
  ADD COLUMN render_intent text NOT NULL DEFAULT 'relative_colorimetric'
    CHECK (render_intent IN ('relative_colorimetric', 'perceptual', 'absolute_colorimetric', 'saturation'));

UPDATE public.product_families
SET color_output = 'rgb', render_intent = 'perceptual'
WHERE slug IN ('photo_book', 'photo-book', 'photo_print', 'photo-print', 'poster', 'posters', 'photo_canvas', 'photo-canvas');