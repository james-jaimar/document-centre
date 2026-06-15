## Root cause

The Bound Documents `Covers` product option has 11 saved catalog values, and the admin has enabled 10 of them. However, 10 of those matching rows in `catalog_finishing` are inactive at master level. The customer overlay currently drops any saved value whose master row has `is_active = false`, so only `Acetate Cover` survives.

This means there are two separate switches:

- **Master catalogue active** = whether the item exists/retired globally.
- **Product option enabled** = whether this product exposes that item to customers.

Right now the customer UI requires both to be active. Your screenshots show you expect the product-level Enabled ticks to control customer visibility for this product.

## Plan

1. **Adjust finishing overlay logic**
   - Update `enrichFinishingValuesFromMaster(...)` so saved product values are authoritative for customer visibility.
   - Keep dropping rows only when:
     - the product value has `is_active = false`, or
     - the catalog code no longer exists in master data.
   - Stop dropping rows merely because the master catalog row has `is_active = false`.
   - Still merge the master label and metadata (`binding_method`, `color`, `size_mm`, `max_sheets`, category) so preview/pricing data remains current.

2. **Make the master finishing query include inactive rows**
   - In `useCatalogBackedOptions.ts`, remove the `.eq("is_active", true)` filter from the `catalog_finishing` query.
   - This lets the overlay find and enrich product-enabled rows that are inactive globally but ticked on the product.
   - The fallback path for new/empty options will still use `finishingRowsToValues(...)`, which filters to active rows only, so brand-new options won’t accidentally expose inactive catalog rows unless saved/ticked on the product.

3. **Keep admin behaviour unchanged**
   - No database migration.
   - No changes to pricing tables.
   - The existing admin Update button continues saving the per-product Enabled/Default ticks into `product_options.values`.

4. **Verify with the actual data**
   - Confirm Bound Documents → Covers resolves to the 10 product-enabled cover options, excluding only `Card Cover Navy` because it is unticked on the product.
   - Confirm Binding and other finishing options still work with their saved enabled values.