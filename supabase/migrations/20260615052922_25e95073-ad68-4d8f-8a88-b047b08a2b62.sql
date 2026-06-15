
-- 1. Schema additions
ALTER TABLE public.product_options
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_filter jsonb;

ALTER TABLE public.product_options
  ADD CONSTRAINT product_options_source_check
  CHECK (source IN ('manual','catalog.sizes','catalog.papers','catalog.finishing'));

ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS pricing_engine text NOT NULL DEFAULT 'click_charges';

ALTER TABLE public.product_families
  ADD CONSTRAINT product_families_pricing_engine_check
  CHECK (pricing_engine IN ('click_charges','photo_prints'));

-- 2. Migrate existing product_recipes into product_options + product_families.pricing_engine
DO $$
DECLARE
  r record;
  cat record;
  papers_json jsonb;
  finishing_json jsonb;
  default_paper text;
  next_sort int;
BEGIN
  FOR r IN SELECT pr.product_family_id, pr.recipe FROM public.product_recipes pr LOOP
    -- Pricing engine on family
    UPDATE public.product_families
      SET pricing_engine = COALESCE(r.recipe->>'engine','click_charges')
      WHERE id = r.product_family_id;

    -- Skip photo_prints families (no paper/finishing wiring)
    IF COALESCE(r.recipe->>'engine','click_charges') = 'photo_prints' THEN
      CONTINUE;
    END IF;

    default_paper := r.recipe->>'default_paper_code';

    -- Build Paper Stock option values from recipe.available_papers, joining catalog_papers for labels
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', COALESCE(cp.label, code_txt),
      'slug', code_txt,
      'group', 'Default',
      'price_impact', 0,
      'price_type', 'per_page',
      'is_default', code_txt = default_paper,
      'is_active', true,
      'metadata', jsonb_build_object('catalog_code', code_txt)
    )), '[]'::jsonb) INTO papers_json
    FROM jsonb_array_elements_text(COALESCE(r.recipe->'available_papers','[]'::jsonb)) AS code_txt
    LEFT JOIN public.catalog_papers cp ON cp.code = code_txt;

    SELECT COALESCE(MAX(sort_order),0)+1 INTO next_sort
      FROM public.product_options WHERE product_family_id = r.product_family_id;

    IF jsonb_array_length(papers_json) > 0 THEN
      -- Upsert Paper Stock option (by name)
      IF EXISTS (SELECT 1 FROM public.product_options
                  WHERE product_family_id = r.product_family_id AND name = 'Paper Stock') THEN
        UPDATE public.product_options
          SET source='catalog.papers', source_filter=NULL, values=papers_json, option_type='select'
          WHERE product_family_id = r.product_family_id AND name = 'Paper Stock';
      ELSE
        INSERT INTO public.product_options
          (product_family_id, name, option_type, values, is_required, sort_order, source, source_filter)
        VALUES
          (r.product_family_id,'Paper Stock','select',papers_json,true,next_sort,'catalog.papers',NULL);
        next_sort := next_sort + 1;
      END IF;
    END IF;

    -- For each finishing category, build option from recipe.finishing entries in that category
    FOR cat IN
      SELECT DISTINCT cf.category
      FROM jsonb_array_elements(COALESCE(r.recipe->'finishing','[]'::jsonb)) elem
      JOIN public.catalog_finishing cf ON cf.code = elem->>'code'
    LOOP
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'label', cf.label,
        'slug', cf.code,
        'group','Default',
        'price_impact',0,
        'price_type','per_document',
        'is_default', false,
        'is_active', true,
        'metadata', jsonb_build_object(
          'catalog_code', cf.code,
          'required', COALESCE((elem->>'required')::boolean,false)
        )
      )),'[]'::jsonb) INTO finishing_json
      FROM jsonb_array_elements(r.recipe->'finishing') elem
      JOIN public.catalog_finishing cf ON cf.code = elem->>'code'
      WHERE cf.category = cat.category;

      IF EXISTS (
        SELECT 1 FROM public.product_options
         WHERE product_family_id = r.product_family_id
           AND source = 'catalog.finishing'
           AND source_filter->>'category' = cat.category
      ) THEN
        UPDATE public.product_options
          SET values = finishing_json, option_type='select'
          WHERE product_family_id = r.product_family_id
            AND source = 'catalog.finishing'
            AND source_filter->>'category' = cat.category;
      ELSE
        INSERT INTO public.product_options
          (product_family_id, name, option_type, values, is_required, sort_order, source, source_filter)
        VALUES
          (r.product_family_id,
           initcap(replace(cat.category,'_',' ')),
           'select',
           finishing_json,
           false,
           next_sort,
           'catalog.finishing',
           jsonb_build_object('category', cat.category));
        next_sort := next_sort + 1;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Drop product_recipes table
DROP TABLE IF EXISTS public.product_recipes;
