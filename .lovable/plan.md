# Fix catalogue Pull/Re-sync error

## What's broken
Clicking **Pull missing from master** (or **Re-sync from master**) on the tenant Catalogue Pricing page returns:

> column "is_enabled" of relation "product_catalog_links" does not exist

## Root cause
The four cascade RPCs created in the previous migration (`clone_master_catalog_to_tenant`, `resync_tenant_catalog_from_master`, `clone_tenant_catalog_to_branch`, `resync_branch_catalog_from_tenant`) insert into `public.product_catalog_links` with columns `(... is_enabled, metadata)`.

The actual table columns are:
`id, product_family_id, catalog, sub_attribute, item_code, sort_order, is_default, created_at, updated_at, scope_type, tenant_id, branch_id`

There is no `is_enabled` and no `metadata` column. Those names belong to `branch_catalog_overrides`, not `product_catalog_links`. Result: every clone aborts before any rows are copied (which is also why the tenant tables are still empty in the screenshot).

## Fix
One migration that recreates the four RPCs with the correct column list for `product_catalog_links`:

```
(scope_type, tenant_id [, branch_id], product_family_id, catalog,
 sub_attribute, item_code, sort_order, is_default)
```

No other changes — the catalog_sizes / print_attrs / papers / finishing / paper_prices / finishing_prices inserts are already correct.

## After the fix
- Re-click **Pull missing from master** on the PostNet tenant page. Paper Stocks, Finishing, and Click Charges tabs should populate from the master catalogue.
- Same buttons on the Branch page will then work for branch-from-tenant cloning.

## Which button to use
- **Pull missing**: additive — brings in any items that don't already exist at your scope. Safe; keeps your edits.
- **Re-sync**: destructive — wipes your scope and replaces with a fresh copy from the parent. Use only when you want to discard local changes.

For PostNet right now (no rows yet), either will work — Pull is the safer default.
