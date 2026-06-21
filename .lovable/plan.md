## Problem

Branch paper rows all show "No sizes set" because their `stocked_sizes` column is empty. Tracing it back:

- **Master** `catalog_papers` rows have `stocked_sizes` populated (e.g. `[a3, a4, sra3]`).
- **Tenant** `catalog_papers` rows have `stocked_sizes = []` — the tenant catalogue was cloned before the recent fix that added `stocked_sizes` to the clone.
- **Branch** `catalog_papers` inherits empty `stocked_sizes` from the tenant.

The clone functions are now correct, but the *existing* tenant + branch data is stale. A fresh resync wouldn't fix the tenant (the tenant-from-master resync has to be triggered at the platform layer, and even then it would not flow down to branches unless the branch is also resynced afterwards).

## Fix

One data-only migration that backfills `stocked_sizes` (and the related `is_cover_stock`, `is_edge_to_edge_only` flags) on every existing tenant and branch `catalog_papers` row from the master row with the same `code`:

```text
UPDATE catalog_papers tenant_row
   SET stocked_sizes        = master.stocked_sizes,
       is_cover_stock       = master.is_cover_stock,
       is_edge_to_edge_only = master.is_edge_to_edge_only
  FROM catalog_papers master
 WHERE master.scope_type = 'master'
   AND tenant_row.code   = master.code
   AND tenant_row.scope_type IN ('tenant','branch')
   AND (tenant_row.stocked_sizes IS NULL OR tenant_row.stocked_sizes = '{}');
```

After the migration the Paper Stocks tab will render the size columns (A4 / A3 / SRA3 / photo / poster sizes) with editable price cells for every paper. No frontend changes needed; the branch manager can then enter their prices directly.

## Out of scope

- No changes to UI components, RPCs, or pricing engine.
- Finishing tab is unaffected (it doesn't depend on `stocked_sizes`).
