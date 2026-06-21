
DELETE FROM public.product_catalog_links a
USING public.product_catalog_links b
WHERE a.ctid > b.ctid
  AND a.product_family_id IS NOT DISTINCT FROM b.product_family_id
  AND a.scope_type        IS NOT DISTINCT FROM b.scope_type
  AND a.tenant_id         IS NOT DISTINCT FROM b.tenant_id
  AND a.branch_id         IS NOT DISTINCT FROM b.branch_id
  AND a.catalog           IS NOT DISTINCT FROM b.catalog
  AND a.sub_attribute     IS NOT DISTINCT FROM b.sub_attribute
  AND a.item_code         IS NOT DISTINCT FROM b.item_code;

CREATE UNIQUE INDEX IF NOT EXISTS product_catalog_links_unique_key
  ON public.product_catalog_links (
    product_family_id,
    scope_type,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    catalog,
    COALESCE(sub_attribute, ''),
    item_code
  );
