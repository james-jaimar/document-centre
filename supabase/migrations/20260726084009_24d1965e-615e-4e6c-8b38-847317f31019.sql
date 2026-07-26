CREATE OR REPLACE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _catalog public.catalog_kind;
BEGIN
  _catalog := CASE TG_TABLE_NAME
    WHEN 'catalog_sizes'       THEN 'size'::public.catalog_kind
    WHEN 'catalog_papers'      THEN 'paper'::public.catalog_kind
    WHEN 'catalog_finishing'   THEN 'finishing'::public.catalog_kind
    WHEN 'catalog_print_attrs' THEN 'print_attr'::public.catalog_kind
  END;

  IF _catalog IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.product_catalog_links
   WHERE catalog = _catalog
     AND lower(item_code) = lower(OLD.code);

  RETURN OLD;
END;
$$;