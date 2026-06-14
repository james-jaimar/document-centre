-- Dedupe before creating unique indexes
delete from public.product_catalog_links a
using public.product_catalog_links b
where a.ctid <> b.ctid
  and a.product_family_id = b.product_family_id
  and a.catalog = b.catalog
  and a.item_code = b.item_code
  and coalesce(a.sub_attribute,'') = coalesce(b.sub_attribute,'')
  and a.created_at > b.created_at;

create unique index if not exists product_catalog_links_family_catalog_item_null_sub_uidx
  on public.product_catalog_links (product_family_id, catalog, item_code)
  where sub_attribute is null;

create unique index if not exists product_catalog_links_family_catalog_sub_item_uidx
  on public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code)
  where sub_attribute is not null;