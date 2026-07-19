
-- 1. Backfill: remove existing orphaned product_catalog_links
DELETE FROM public.product_catalog_links pcl
WHERE pcl.catalog = 'size'
  AND NOT EXISTS (SELECT 1 FROM public.catalog_sizes cs WHERE lower(cs.code) = lower(pcl.item_code));

DELETE FROM public.product_catalog_links pcl
WHERE pcl.catalog = 'paper'
  AND NOT EXISTS (SELECT 1 FROM public.catalog_papers cp WHERE lower(cp.code) = lower(pcl.item_code));

DELETE FROM public.product_catalog_links pcl
WHERE pcl.catalog = 'finishing'
  AND NOT EXISTS (SELECT 1 FROM public.catalog_finishing cf WHERE lower(cf.code) = lower(pcl.item_code));

DELETE FROM public.product_catalog_links pcl
WHERE pcl.catalog = 'print_attr'
  AND NOT EXISTS (SELECT 1 FROM public.catalog_print_attrs cpa WHERE lower(cpa.code) = lower(pcl.item_code));

-- 2. Generic cleanup trigger function
CREATE OR REPLACE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _catalog text;
BEGIN
  _catalog := CASE TG_TABLE_NAME
    WHEN 'catalog_sizes' THEN 'size'
    WHEN 'catalog_papers' THEN 'paper'
    WHEN 'catalog_finishing' THEN 'finishing'
    WHEN 'catalog_print_attrs' THEN 'print_attr'
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

-- 3. Attach triggers
DROP TRIGGER IF EXISTS trg_catalog_sizes_cleanup_links ON public.catalog_sizes;
CREATE TRIGGER trg_catalog_sizes_cleanup_links
AFTER DELETE ON public.catalog_sizes
FOR EACH ROW EXECUTE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete();

DROP TRIGGER IF EXISTS trg_catalog_papers_cleanup_links ON public.catalog_papers;
CREATE TRIGGER trg_catalog_papers_cleanup_links
AFTER DELETE ON public.catalog_papers
FOR EACH ROW EXECUTE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete();

DROP TRIGGER IF EXISTS trg_catalog_finishing_cleanup_links ON public.catalog_finishing;
CREATE TRIGGER trg_catalog_finishing_cleanup_links
AFTER DELETE ON public.catalog_finishing
FOR EACH ROW EXECUTE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete();

DROP TRIGGER IF EXISTS trg_catalog_print_attrs_cleanup_links ON public.catalog_print_attrs;
CREATE TRIGGER trg_catalog_print_attrs_cleanup_links
AFTER DELETE ON public.catalog_print_attrs
FOR EACH ROW EXECUTE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete();
