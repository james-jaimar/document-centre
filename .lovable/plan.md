

# Plan: Fix Fold Type Selection Not Updating Preview

## Problem

When user selects Z-Fold (or any fold type) in the brochures configurator, the preview doesn't switch to the fold panel view. It stays as loose sheets.

## Root Cause

The `productType` derivation in `OrderBuild.tsx` only checks for a "Binding" option to determine preview type. For brochures:
- Product family slug is `"brochures"` — not in `SLUG_TO_PREVIEW`
- Falls back to `"loose_sheets"`
- The "Fold Type" option is never consulted

The fold type option slugs are auto-generated from labels (e.g. `"z_fold_2_folds_6_panels"`), so they don't match the preview type codes (`"z_fold"`).

## Fix

**`src/pages/dashboard/OrderBuild.tsx`** — Extend the `productType` derivation:

1. After the binding option check, add a "Fold Type" option check
2. Look at the selected fold type value's metadata (`fold_style`) or match the slug prefix to map to the correct `ProductPreviewType`:
   - Slug starts with `"bi_fold"` → `"bi_fold"`
   - Slug starts with `"tri_fold"` → `"tri_fold"`
   - Slug starts with `"z_fold"` → `"z_fold"`
   - Slug starts with `"gate_fold"` → `"gate_fold"`
3. Add `"brochures"` to `SLUG_TO_PREVIEW` as a default fallback to `"bi_fold"` (the default fold type)

Alternatively, add explicit `fold_type` metadata to each fold option value in `productOptionValues.ts` (e.g. `metadata: { fold_type: "z_fold" }`) for cleaner mapping.

## Changes

| File | Change |
|------|--------|
| `src/lib/productOptionValues.ts` | Add `fold_type` key to each fold option's metadata (e.g. `fold_type: "bi_fold"`) |
| `src/pages/dashboard/OrderBuild.tsx` | Add fold type option lookup in `productType` derivation — check "Fold Type" option, read `metadata.fold_type`, map to `ProductPreviewType` |

## Implementation Order
1. Add `fold_type` metadata to fold option values
2. Update `productType` derivation to check fold type option

