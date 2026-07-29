## Problem
The "Create product" step for Canvas Prints fails with `Invalid product family kind: canvas_wrap`. The DB trigger `public.validate_product_family_kind` (migration `20260724112024`) whitelists kinds but was never updated when we added `canvas_wrap` to the frontend `FamilyKind` enum.

## Fix
One-line migration to replace `validate_product_family_kind` so its allowed set matches the frontend enum in `src/lib/products/familyKind.ts`:

- `flat_sheet`
- `bound_document`
- `folded_leaflet`
- `saddle_stitched`
- `business_card`
- `large_format`
- `photo_print`
- `canvas_wrap`  ← add
- `custom`

No table, RLS, or code changes needed. After the migration runs, the "Create product" wizard will succeed for Canvas wrap.