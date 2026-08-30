-- 1. Finishing / cover weights
ALTER TABLE public.catalog_finishing
  ADD COLUMN IF NOT EXISTS weight_grams numeric;

COMMENT ON COLUMN public.catalog_finishing.weight_grams IS
  'Weight contribution of this finishing item, in grams, interpreted per its pricing_basis (per_unit = per copy, per_sheet = per sheet).';

-- 2. Job-level weight override + provenance
ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS weight_grams_override numeric,
  ADD COLUMN IF NOT EXISTS weight_source text;

-- 3. Allow the optional weight_grams key on pack ladders.
CREATE OR REPLACE FUNCTION public.validate_product_family_quantity_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  blk jsonb;
BEGIN
  IF NEW.quantity_blocks IS NULL THEN
    NEW.quantity_blocks := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(NEW.quantity_blocks) <> 'array' THEN
    RAISE EXCEPTION 'quantity_blocks must be a JSON array';
  END IF;

  FOR blk IN SELECT * FROM jsonb_array_elements(NEW.quantity_blocks) LOOP
    IF blk->>'size' IS NULL OR blk->>'paper' IS NULL OR blk->>'sides' IS NULL
       OR blk->>'qty' IS NULL OR blk->>'price_minor' IS NULL THEN
      RAISE EXCEPTION 'Each quantity block needs size, paper, sides, qty and price_minor';
    END IF;
    IF (blk->>'sides') NOT IN ('single','double') THEN
      RAISE EXCEPTION 'quantity block sides must be single or double';
    END IF;
    IF (blk->>'qty')::numeric < 1 THEN
      RAISE EXCEPTION 'quantity block qty must be at least 1';
    END IF;
    IF (blk->>'price_minor')::numeric < 0 THEN
      RAISE EXCEPTION 'quantity block price_minor cannot be negative';
    END IF;
    IF blk ? 'weight_grams' AND blk->>'weight_grams' IS NOT NULL
       AND (blk->>'weight_grams')::numeric < 0 THEN
      RAISE EXCEPTION 'quantity block weight_grams cannot be negative';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
