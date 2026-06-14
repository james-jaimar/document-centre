## Problem

Editing a paper in the master catalogue (and similarly sizes/finishing/links) fails with:

> there is no unique or exclusion constraint matching the ON CONFLICT specification

The frontend hooks call `upsert(row, { onConflict: "code" })` (and similar) on:

- `catalog_papers` — onConflict: `code`
- `catalog_sizes` — onConflict: `code`
- `catalog_finishing` — onConflict: `code`
- `product_catalog_links` — onConflict: `product_family_id,catalog,sub_attribute,item_code`
- `branch_catalog_overrides` — onConflict: `branch_id,catalog,sub_attribute,item_code`

But the tables only have a primary-key constraint on `id`. None of the columns above are unique, so Postgres rejects every upsert — including the Save in your Edit Paper dialog.

This happened because when we added `scope_type / tenant_id / branch_id` to make the catalogue cascadable, the old "unique on `code`" assumption stopped being valid (the same `code` now legitimately exists once per scope), and the replacement scoped-unique indexes were never added.

## Fix

Add scope-aware unique indexes that match what the hooks expect, then the existing upsert calls work unchanged.

### Migration

For each of `catalog_papers`, `catalog_sizes`, `catalog_finishing`:

```sql
CREATE UNIQUE INDEX catalog_papers_scope_code_uidx
  ON public.catalog_papers (scope_type, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
```

For `product_catalog_links`:

```sql
CREATE UNIQUE INDEX product_catalog_links_scope_uidx
  ON public.product_catalog_links (scope_type, COALESCE(tenant_id,'0…'::uuid), COALESCE(branch_id,'0…'::uuid),
                                   product_family_id, catalog, COALESCE(sub_attribute,''), item_code);
```

For `branch_catalog_overrides`:

```sql
CREATE UNIQUE INDEX branch_catalog_overrides_uidx
  ON public.branch_catalog_overrides (branch_id, catalog, COALESCE(sub_attribute,''), item_code);
```

(First de-duplicate any existing duplicate rows before creating the indexes — I'll check with a `SELECT … HAVING count(*) > 1` and keep the lowest `id` row in each group.)

### Hook updates

Change the upsert `onConflict` strings to include the scope columns, e.g.:

```ts
.upsert(row, { onConflict: "scope_type,tenant_id,branch_id,code" })
```

and ensure the row object always sets `scope_type` (+ `tenant_id`/`branch_id` as needed) — currently `useUpsertCatalogPaper`/`Size`/`Finishing` don't, which is why edits silently target the wrong scope. The MasterCatalogPricingEditor / Admin / Branch editors already know which scope they're in, so they'll pass it through.

## Result

- Edit Paper → Save works in master, tenant, and branch catalogues.
- Same code can coexist across scopes (e.g. master `80gsm-bond` and a tenant override `80gsm-bond`) without colliding.
- Catalog link / branch override upserts stop throwing the same ON CONFLICT error.

No data is deleted apart from true duplicate rows (same scope + same code), which I'll list for you before the migration runs.
