## Problem

Adding an Executive variant price for Pull-up Banners fails with:
- Branch scope: `duplicate key value violates unique constraint "rcc_branch_unique"`
- Tenant scope: `duplicate key value violates unique constraint "rcc_tenant_unique"`

## Root cause (confirmed via pg_indexes)

On `public.rate_card_clicks` the three scope unique indexes are inconsistent:

```text
rcc_master_unique  (size, colour, sides, COALESCE(variant_code,''))       -- master
rcc_tenant_unique  (tenant_id, size, colour, sides, COALESCE(variant_code,''))  -- tenant
rcc_branch_unique  (branch_id, size, colour, sides)                       -- branch — MISSING variant_code
```

So at branch scope, Economy (size=2000x850, colour=full_colour, sides=single) and Executive with the same size/colour/sides collide — the index treats them as the same row.

The tenant-scope error the user also saw is the same class of bug at the write path: when the matrix inserts a variant row at tenant scope without passing `variant_code`, the `COALESCE(variant_code,'')` in the tenant index collapses Economy and Executive to the same key. Fixing the branch index removes the branch error; the tenant error needs the insert path to actually send `variant_code`.

## Fix

1. Migration: drop and recreate `rcc_branch_unique` to include `variant_code`, matching the master/tenant shape.

   ```sql
   DROP INDEX IF EXISTS public.rcc_branch_unique;
   CREATE UNIQUE INDEX rcc_branch_unique
     ON public.rate_card_clicks (branch_id, size, colour, sides, COALESCE(variant_code, ''))
     WHERE scope_type = 'branch';
   ```

2. Verify the insert path in `VariantPricingMatrix.tsx` (and any hook it calls, e.g. `useResolvedRateCardClicks` writers) actually sends `variant_code` for every scope — not just branch. If a tenant-scope add omits it, populate it from the selected variant before insert.

3. Sanity-check that any existing branch rows aren't already duplicated on the new key before creating the unique index (query first; if duplicates exist from earlier failed clones, delete the redundant one keeping the row with the non-null `variant_code`).

## Out of scope

No UI changes needed unless step 2 finds the insert genuinely omits `variant_code`. Master/tenant indexes are already correct.
