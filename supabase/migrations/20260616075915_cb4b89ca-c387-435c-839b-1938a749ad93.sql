ALTER TABLE public.product_options DROP CONSTRAINT IF EXISTS product_options_source_check;
ALTER TABLE public.product_options ADD CONSTRAINT product_options_source_check
  CHECK (source = ANY (ARRAY['manual','catalog.sizes','catalog.papers','catalog.finishing','catalog.print_attrs']));