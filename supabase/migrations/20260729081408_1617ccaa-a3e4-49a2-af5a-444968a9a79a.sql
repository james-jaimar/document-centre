CREATE OR REPLACE FUNCTION public.validate_product_family_kind()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind IS NOT NULL AND NEW.kind NOT IN (
    'flat_sheet','bound_document','folded_leaflet','saddle_stitched',
    'business_card','large_format','photo_print','canvas_wrap','custom'
  ) THEN
    RAISE EXCEPTION 'Invalid product family kind: %', NEW.kind;
  END IF;
  RETURN NEW;
END $$;