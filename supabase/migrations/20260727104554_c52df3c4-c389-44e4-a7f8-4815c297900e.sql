
-- 1) Scope the cascade so a master-catalogue delete no longer wipes tenant/branch links.
CREATE OR REPLACE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  DELETE FROM public.product_catalog_links pcl
   WHERE pcl.catalog = _catalog
     AND lower(pcl.item_code) = lower(OLD.code)
     AND pcl.scope_type = OLD.scope_type
     AND pcl.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND pcl.branch_id IS NOT DISTINCT FROM OLD.branch_id;

  RETURN OLD;
END;
$function$;

-- 2) Restore master product_catalog_links per family slug.
--    Idempotent: skips any (family, catalog, sub_attribute, item_code) already present.
DO $do$
DECLARE
  r RECORD;
  s TEXT;
  a RECORD;
  p RECORD;
  f RECORD;
  size_map jsonb := jsonb_build_object(
    'bound-documents',     jsonb_build_array('a6','a5','a4','a3','us-letter'),
    'presentations',       jsonb_build_array('a4-landscape','a3-landscape','a5-landscape'),
    'stapled-loose-pages', jsonb_build_array('a6','a5','a4','a3','a4-landscape','a3-landscape','us-letter'),
    'booklets',            jsonb_build_array('a6','a5','a4'),
    'ring-binders',        jsonb_build_array('a5','a4','a3'),
    'flyers',              jsonb_build_array('dl','a6','a5','a4','a3','a5-landscape','a4-landscape','a3-landscape'),
    'brochures',           jsonb_build_array('dl','a5','a4','a3','a5-landscape','a4-landscape','a3-landscape'),
    'posters',             jsonb_build_array('a3','a2','a1','a0'),
    'business-cards',      jsonb_build_array('bc-85x55','bc-90x55','bc-90x50'),
    'photo-prints',        jsonb_build_array('photo-4x6','photo-5x7','photo-6x8'),
    'pull-up-banners',     jsonb_build_array('pub-850x2000')
  );
BEGIN
  FOR r IN
    SELECT id, slug FROM public.product_families
     WHERE tenant_id IS NULL AND slug = ANY (ARRAY(SELECT jsonb_object_keys(size_map)))
  LOOP
    -- sizes
    FOR s IN SELECT jsonb_array_elements_text(size_map->r.slug) LOOP
      INSERT INTO public.product_catalog_links
        (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, is_default)
      SELECT 'master', NULL, NULL, r.id, 'size', '', s, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_catalog_links x
         WHERE x.scope_type='master' AND x.tenant_id IS NULL AND x.branch_id IS NULL
           AND x.product_family_id=r.id AND x.catalog='size'
           AND COALESCE(x.sub_attribute,'')='' AND x.item_code=s
      );
    END LOOP;

    -- print_attrs: link every active master attr to every family
    FOR a IN SELECT attribute, code FROM public.catalog_print_attrs
             WHERE scope_type='master' AND is_active LOOP
      INSERT INTO public.product_catalog_links
        (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, is_default)
      SELECT 'master', NULL, NULL, r.id, 'print_attr', a.attribute, a.code, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_catalog_links x
         WHERE x.scope_type='master' AND x.tenant_id IS NULL AND x.branch_id IS NULL
           AND x.product_family_id=r.id AND x.catalog='print_attr'
           AND COALESCE(x.sub_attribute,'')=a.attribute AND x.item_code=a.code
      );
    END LOOP;

    -- papers: link every active master paper to every family
    FOR p IN SELECT code FROM public.catalog_papers
             WHERE scope_type='master' AND is_active LOOP
      INSERT INTO public.product_catalog_links
        (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, is_default)
      SELECT 'master', NULL, NULL, r.id, 'paper', '', p.code, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_catalog_links x
         WHERE x.scope_type='master' AND x.tenant_id IS NULL AND x.branch_id IS NULL
           AND x.product_family_id=r.id AND x.catalog='paper'
           AND COALESCE(x.sub_attribute,'')='' AND x.item_code=p.code
      );
    END LOOP;

    -- finishing: link every active master finishing row to every family
    FOR f IN SELECT code FROM public.catalog_finishing
             WHERE scope_type='master' AND is_active LOOP
      INSERT INTO public.product_catalog_links
        (scope_type, tenant_id, branch_id, product_family_id, catalog, sub_attribute, item_code, is_default)
      SELECT 'master', NULL, NULL, r.id, 'finishing', '', f.code, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_catalog_links x
         WHERE x.scope_type='master' AND x.tenant_id IS NULL AND x.branch_id IS NULL
           AND x.product_family_id=r.id AND x.catalog='finishing'
           AND COALESCE(x.sub_attribute,'')='' AND x.item_code=f.code
      );
    END LOOP;
  END LOOP;
END
$do$;
