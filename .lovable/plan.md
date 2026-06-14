# Fix "no unique constraint matching ON CONFLICT" on Catalogue links

## Root cause

`useSetProductCatalogLink` (src/hooks/useCatalog.ts:338) upserts into `product_catalog_links` with
`onConflict: "product_family_id,catalog,sub_attribute,item_code"`, but the table has no matching unique constraint — only a PK on `id` and the FK to `product_families`. Postgres therefore rejects every toggle with the error shown in the screenshot.

`sub_attribute` is nullable (used only for `print_attr` rows like `colour`/`sides`; null for `size`), so a plain unique constraint over four columns treats NULLs as distinct and still won't satisfy the upsert.

## Fix

One migration, two partial unique indexes (NULL-safe, works on all PG versions):

```sql
-- For size links (sub_attribute IS NULL)
create unique index if not exists product_catalog_links_family_catalog_item_null_sub_uidx
  on public.product_catalog_links (product_family_id, catalog, item_code)
  where sub_attribute is null;

-- For print_attr links (sub_attribute IS NOT NULL)
create unique index if not exists product_catalog_links_family_catalog_sub_item_uidx
  on public.product_catalog_links (product_family_id, catalog, sub_attribute, item_code)
  where sub_attribute is not null;
```

Before creating the indexes, dedupe any existing rows that would violate them (keep earliest `created_at`):

```sql
delete from public.product_catalog_links a
using public.product_catalog_links b
where a.ctid <> b.ctid
  and a.product_family_id = b.product_family_id
  and a.catalog = b.catalog
  and a.item_code = b.item_code
  and coalesce(a.sub_attribute,'') = coalesce(b.sub_attribute,'')
  and a.created_at > b.created_at;
```

## Code change

Update `useSetProductCatalogLink` upsert to use the matching index column list depending on `sub_attribute`:
- size rows → `onConflict: "product_family_id,catalog,item_code"`
- print_attr rows → keep `"product_family_id,catalog,sub_attribute,item_code"`

Branch on `sub_attribute == null` inside the mutation. Delete path is unchanged.

## Verify

After migration: toggle A4 on Bound Documents in `/admin/products`. Expect success toast and the row to appear in `product_catalog_links`. Toggle off → row removed. Same check for a print_attr (e.g. Colour → Mono).

## Out of scope

No changes to `branch_catalog_overrides` (already has a matching constraint based on the working upsert at useCatalog.ts:405). No changes to catalogue or pricing tables.
