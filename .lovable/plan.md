

# Plan: Fix Fold Preview Not Activating for Brochures

## Problem

When a brochure with Z-Fold selected is configured, the preview shows flat pages with "Page 1 of 2" navigation (LooseSheetsPreview) instead of the animated FoldPreview with Fold/Unfold + Front/Back controls.

## Root Cause (Two Issues)

### Issue 1: productType fallback missing `"brochures"` slug
The `SLUG_TO_PREVIEW` map in `OrderBuild.tsx` has entries for `bi_fold`, `z_fold`, etc. but NOT for the product family slug `"brochures"`. If the fold type option lookup fails (e.g. options still loading), the fallback at line 246 checks `SLUG_TO_PREVIEW["brochures"]` → `undefined` → defaults to `"loose_sheets"`.

### Issue 2: PreviewPanel always shows page navigation
`PreviewPanel` renders page-by-page navigation (slider, arrows, "Page X of Y") for ALL product types. For fold types, `FoldPreview` has its own Fold/Unfold and Front/Back buttons — the outer navigation is wrong and confusing. The panel should hide its page navigation when the product type is a fold.

## Changes

| File | Change |
|------|--------|
| `src/pages/dashboard/OrderBuild.tsx` | Add `"brochures": "bi_fold"` to `SLUG_TO_PREVIEW` as a fallback default |
| `src/components/order/PreviewPanel.tsx` | Detect fold product types and hide the page navigation controls (slider, arrows, page info). Only show `DocumentPreview` which renders `FoldPreview` with its own controls. Add a `FOLD_TYPES` set check. |

## Implementation Order
1. Add brochures slug fallback in OrderBuild
2. Hide page navigation in PreviewPanel for fold types

