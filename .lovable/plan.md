## Problem

Saving variants on a product family fails with:
> Could not find the 'variant_id' column of 'product_variant_links' in the schema cache

## Root cause (verified via schema query)

The `product_variant_links` table's foreign key column is named **`catalog_variant_id`**, not `variant_id`. The client hook `useCatalogVariants.ts` (and the join in the family editor) writes/reads `variant_id`, so PostgREST rejects it.

The master table `catalog_variants` and the click-charge column `rate_card_clicks.variant_code` already exist and are named correctly — no migration needed.

## Fix

Rename all client references from `variant_id` → `catalog_variant_id` on the `product_variant_links` shape only:

1. **`src/hooks/useCatalogVariants.ts`**
   - `ProductVariantLink.variant_id` → `catalog_variant_id`
   - Select join: `variant:catalog_variants(*)` keyed off `catalog_variant_id`
   - `useSetProductVariantLinks` insert rows use `catalog_variant_id`

2. **`src/components/admin/ProductFamilyVariantsEditor.tsx`**
   - Read `l.catalog_variant_id` when building the selected map and default lookup
   - Emit `catalog_variant_id` in the payload passed to `setLinks.mutateAsync`

3. **`src/pages/dashboard/OrderBuild.tsx`** — anywhere it reads `link.variant_id` from `useProductVariantLinks`, switch to `link.catalog_variant_id` (default seeding + variant list for `OptionsPanel`).

No database migration, no SQL, no schema change. Purely a client rename to match the existing DB.
