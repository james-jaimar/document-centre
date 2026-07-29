## Problem

When a customer uploads a non-standard image on the Canvas Prints (and any non-generic) product, the "Choose Output Size" dialog shows the hard-coded ISO A-series list (`ISO_SIZES` in `src/components/order/ImageSizeDialog.tsx`) instead of the sizes actually enabled for that product family in the catalogue (e.g. Canvas Prints has A0–A4 plus square 300–1000 mm).

Root cause (verified):
- `ImageSizeDialog.tsx` builds `sizeOptions` from the constant `ISO_SIZES` and ignores the current product family.
- `OrderFiles.tsx` renders `<ImageSizeDialog>` without passing any product context.
- Resolved sizes are already available via `useResolvedCatalogOptions` / `useResolvedAllowedSizeLabels` / `useResolvedAllowedCustomSizes` (product_family_id + branch_id).

## Fix

1. `ImageSizeDialog.tsx`
   - Add optional prop `allowedSizes?: PaperSize[]`.
   - When provided and non-empty, use it as the source list instead of `ISO_SIZES` (still orientation-matched to the image, still with "Original Size" row at the bottom).
   - Fall back to `ISO_SIZES` when not provided (preserves current behaviour for other flows).

2. `OrderFiles.tsx`
   - Compute the effective size list for the current `productFamily`:
     - Start with resolved ISO labels from `useResolvedAllowedSizeLabels` → map each label back to its `PaperSize` via `ISO_SIZES` / non-ISO tables.
     - Append custom sizes from `useResolvedAllowedCustomSizes` (already `PaperSize[]`).
   - Pass the merged list as `allowedSizes` to `<ImageSizeDialog>`.
   - If nothing resolves (unconfigured family), leave prop undefined so the dialog behaves as today.

3. No changes to Canvas Builder page (it has its own size flow); this only affects the generic upload dialog used by `OrderFiles.tsx`, which is the surface the user hit.

## Out of scope

- Pricing, upload pipeline, and PosterImageEditor flows are unchanged.
- No DB or RLS changes.