
-- Add product family "kind" template selector — unlocks admin-configurable
-- configurator/preview behaviour instead of slug-string checks scattered
-- across the frontend.
ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS kind text;

-- Backfill from existing slugs (safe: only fills NULLs).
UPDATE public.product_families SET kind = CASE
  WHEN lower(slug) IN ('booklets','saddle-stitched','saddle_stitched') THEN 'saddle_stitched'
  WHEN lower(slug) IN ('brochures','brochure','folded-leaflets','folded_leaflets','folded-leaflet','folded_leaflet') THEN 'folded_leaflet'
  WHEN lower(slug) IN ('flyers','flyer','posters','poster','handouts','handout') THEN 'flat_sheet'
  WHEN lower(slug) IN ('business-cards','business_cards','business-card') THEN 'business_card'
  WHEN lower(slug) IN ('pull-up-banners','pull_up_banners','banners','banner','large-format','large_format') THEN 'large_format'
  WHEN lower(slug) IN ('photo-prints','photo_prints','photos') THEN 'photo_print'
  WHEN lower(slug) IN ('wire-bound','wire_bound','comb-bound','comb_bound','spiral-bound','spiral_bound','bound-documents','bound_documents','perfect-bound','perfect_bound') THEN 'bound_document'
  ELSE 'custom'
END
WHERE kind IS NULL;

-- Validation trigger (avoid CHECK constraint per project convention).
CREATE OR REPLACE FUNCTION public.validate_product_family_kind()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS NOT NULL AND NEW.kind NOT IN (
    'flat_sheet','bound_document','folded_leaflet','saddle_stitched',
    'business_card','large_format','photo_print','custom'
  ) THEN
    RAISE EXCEPTION 'Invalid product family kind: %', NEW.kind;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_product_family_kind ON public.product_families;
CREATE TRIGGER trg_validate_product_family_kind
  BEFORE INSERT OR UPDATE OF kind ON public.product_families
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_family_kind();
