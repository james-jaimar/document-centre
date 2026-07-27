## What happened

At **09:54:15 UTC today** every row in `catalog_sizes`, `catalog_papers`, `catalog_finishing`, and `catalog_print_attrs` was re-inserted (all four tables share the exact same `created_at` timestamp). The trigger `cleanup_product_catalog_links_on_catalog_delete` runs on every delete against those tables and executes:

```sql
DELETE FROM product_catalog_links
 WHERE catalog = <kind> AND lower(item_code) = lower(OLD.code);
```

It does **not** scope by tenant/branch or by the catalog row's scope, so a single master-catalog delete cascades into **every** master/tenant/branch link that referenced that code. Result: `product_catalog_links` went from ~thousands of rows down to the 11 rows you've manually re-toggled since 10:25.

Confirmed from the DB:
- `catalog_sizes` etc. max(created_at) = `2026-07-27 09:54:15` (all rows).
- `product_catalog_links` now has only 11 master rows, 0 tenant, 0 branch.
- All master product families show 0–3 size links (Flyers, Business Cards, Brochures, Booklets, Posters all = 0).

Root cause is confirmed; who triggered the 09:54 reseed is not yet identified (no migration in `supabase/migrations/` performs that wipe — it was likely a manual reseed run against the DB, or a code path that DELETE+INSERTs the master catalog).

## Recovery plan

### 1. Restore master `product_catalog_links` for every product family

There is no backup table to restore from. The links have to be rebuilt from a canonical spec. I'll write a single migration that, **per product family (matched by slug)**, inserts the master-scope size / print_attr / paper / finishing links that family should have, using `INSERT … ON CONFLICT DO NOTHING` so it's idempotent and won't clobber the rows you've re-toggled.

Product-family → sizes mapping to encode (drawn from existing product specs / configurator code — I'll verify each in `src/hooks/useProductFamilies.ts`, `NewProductWizard.tsx`, `BoundDocumentConfigurator`, and the "Product Family Specifications" memory before writing the SQL):

- Bound Documents: A6, A5, A4, A3, US Letter
- Presentations: A4 Landscape, A3 Landscape, US Letter Landscape (as applicable)
- Stapled & Loose Pages: A6, A5, A4, A3, A4 Landscape, A3 Landscape, US Letter
- Booklets: A6, A5, A4
- Ring Binders: A5, A4, A3
- Flyers: DL, A6, A5, A4, A3, A5 Landscape, A4 Landscape, A3 Landscape
- Brochures / Folded Leaflets: DL, A5, A4, A3, A5 Landscape, A4 Landscape, A3 Landscape
- Posters: A3, A2, A1, A0
- Business Cards: bc-85x55, bc-90x55, bc-90x50
- Photo Prints: photo-4x6, photo-5x7, photo-6x8
- Pull Up Banners: pub-850x2000

Print attrs, papers, finishing: re-link every currently active master row for the catalogs each family previously exposed (broadly: colour + sides + orientation for all doc families; papers = all active master papers; finishing = all active master finishing rows relevant to the family kind). I'll enumerate these in the plan's SQL rather than guess — happy to walk through the exact list with you before applying if you'd rather sign off item-by-item.

### 2. Tenant / branch links

Tenant and branch `product_catalog_links` rows are also gone (0 rows in the DB). The design already falls back through `resolve_product_options` **master → tenant → branch**, so once master is restored, every tenant/branch storefront works again with the master defaults. Tenants/branches that had bespoke overrides will need to re-toggle them; there is no way to reconstruct those without a backup. I'll flag this so you can spot-check the two or three tenants where you know overrides existed.

### 3. Fix the cleanup trigger so this can't happen again

Rewrite `cleanup_product_catalog_links_on_catalog_delete` to scope the cascade to the deleted row's own scope:

```sql
DELETE FROM public.product_catalog_links pcl
 WHERE pcl.catalog   = _catalog
   AND lower(pcl.item_code) = lower(OLD.code)
   AND pcl.scope_type = OLD.scope_type
   AND pcl.tenant_id  IS NOT DISTINCT FROM OLD.tenant_id
   AND pcl.branch_id  IS NOT DISTINCT FROM OLD.branch_id;
```

That way deleting a master catalog row only clears master links; deleting a branch-scoped size only clears that branch's links. A future accidental "wipe + reinsert" of master catalog would still nuke master links (unavoidable while the trigger exists), but it would no longer take tenant and branch overrides with it.

### 4. Verify

- Query `product_catalog_links` counts per family after the restore and confirm every master family has its expected sizes / attrs / papers / finishing.
- Load Platform → Products → each family → Catalogue tab and confirm the switches match.
- Load one storefront (e.g. a Postnet branch) and confirm the Flyers / Business Cards / Bound Documents configurators show sizes again.

## Technical notes

- One migration file, three steps in order: (a) fix the trigger, (b) `INSERT … ON CONFLICT DO NOTHING` to rebuild master links per family slug, (c) `RAISE NOTICE` a per-family count for the review log.
- No changes to `catalog_sizes`/`papers`/`finishing`/`print_attrs` themselves — those tables are healthy.
- No frontend changes required.

## One thing I'd like to confirm before writing the SQL

The family-to-sizes list above is my best reconstruction from the product specs already in the codebase and memory. If you want to tweak any family's default size set (e.g. add SRA3 to Posters, drop US Letter from Bound Documents), tell me now and I'll bake it into the restore — otherwise I'll go with the list above.
