-- Drop the partial indexes from previous attempt
drop index if exists public.product_catalog_links_family_catalog_item_null_sub_uidx;
drop index if exists public.product_catalog_links_family_catalog_sub_item_uidx;

-- Normalise nulls to empty string so a single unique constraint works
update public.product_catalog_links set sub_attribute = '' where sub_attribute is null;

alter table public.product_catalog_links
  alter column sub_attribute set default '',
  alter column sub_attribute set not null;

-- Dedupe defensively
delete from public.product_catalog_links a
using public.product_catalog_links b
where a.ctid <> b.ctid
  and a.product_family_id = b.product_family_id
  and a.catalog = b.catalog
  and a.item_code = b.item_code
  and a.sub_attribute = b.sub_attribute
  and a.created_at > b.created_at;

alter table public.product_catalog_links
  add constraint product_catalog_links_family_catalog_sub_item_key
  unique (product_family_id, catalog, sub_attribute, item_code);