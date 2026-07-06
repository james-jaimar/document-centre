
-- 1. Backfill: existing quantity_blocks rows only had qty/price/cost.
--    Re-key them as size='*' (any), paper='*' (any), sides='single' so
--    the customer flow keeps returning them as matches.
UPDATE public.product_families
SET quantity_blocks = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem ? 'size' AND elem ? 'paper' AND elem ? 'sides'
          THEN elem
        ELSE
          elem
          || jsonb_build_object(
               'size',  COALESCE(elem->>'size',  '*'),
               'paper', COALESCE(elem->>'paper', '*'),
               'sides', COALESCE(elem->>'sides', 'single')
             )
      END
    )
    FROM jsonb_array_elements(quantity_blocks) elem
  ),
  '[]'::jsonb
)
WHERE quantity_mode = 'blocks'
  AND jsonb_typeof(quantity_blocks) = 'array'
  AND jsonb_array_length(quantity_blocks) > 0;

-- 2. Validation trigger: enforce shape of each block row.
CREATE OR REPLACE FUNCTION public.validate_product_family_quantity_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  elem jsonb;
BEGIN
  IF NEW.quantity_blocks IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.quantity_blocks) <> 'array' THEN
    RAISE EXCEPTION 'quantity_blocks must be a JSON array';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(NEW.quantity_blocks) LOOP
    IF NOT (elem ? 'size' AND elem ? 'paper' AND elem ? 'sides'
            AND elem ? 'qty'  AND elem ? 'price_minor') THEN
      RAISE EXCEPTION
        'Each quantity_blocks row must include size, paper, sides, qty, price_minor (got %)',
        elem;
    END IF;

    IF NOT (elem->>'sides' IN ('single','double')) THEN
      RAISE EXCEPTION 'quantity_blocks.sides must be "single" or "double" (got %)', elem->>'sides';
    END IF;

    IF (elem->>'qty')::int < 1 THEN
      RAISE EXCEPTION 'quantity_blocks.qty must be >= 1 (got %)', elem->>'qty';
    END IF;

    IF (elem->>'price_minor')::int < 0 THEN
      RAISE EXCEPTION 'quantity_blocks.price_minor must be >= 0 (got %)', elem->>'price_minor';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_family_quantity_blocks
  ON public.product_families;

CREATE TRIGGER trg_validate_product_family_quantity_blocks
BEFORE INSERT OR UPDATE OF quantity_blocks ON public.product_families
FOR EACH ROW EXECUTE FUNCTION public.validate_product_family_quantity_blocks();
