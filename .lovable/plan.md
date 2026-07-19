## Problem

Uploading `pull up banner.pdf` (850 × 2200mm) triggers "Unrecognised Paper Size" and only offers A4/A3/A0 — even though "Pull Up Banners" has a size configured in the master catalogue.

Root cause (confirmed via `resolve_product_options` for family `pull-up-banners`):
- The catalogue returns one size row: `item_code=pub-850x2000`, `metadata={width_mm:2000, height_mm:850, iso:"Pull Up Banner"}`.
- `useResolvedAllowedSizeLabels` maps that to the label `"Pull Up Banner"`.
- `PaperSizeAdvisory` and `OrderFiles` only recognise names/dimensions that exist in `ISO_SIZES` / `NON_ISO_SIZES` (`matchIsoSize`, `matchKnownSize`). Product‑family custom dimensions are never consulted, so 850 × 2000 (or 2200) can never be a "known" size.

Note on the specific file: catalogue is **850 × 2000mm**, upload is **850 × 2200mm**. Even after this fix that upload is outside tolerance and would still show the advisory — but the advisory will then correctly recommend "Scale to Pull Up Banner (850 × 2000mm)" rather than A4. Please confirm whether the intended pull‑up size is 2000 or 2200; if it's 2200 the master catalogue item needs updating.

## Changes

### 1. `src/hooks/useResolvedCatalogOptions.ts`
Add a second helper next to `useResolvedAllowedSizeLabels`:

```ts
useResolvedAllowedCustomSizes(productFamilyId, branchId): { sizes: PaperSize[] }
```

Returns one `PaperSize` per enabled `catalog === "size"` row whose `metadata.width_mm` and `metadata.height_mm` are numeric AND whose dimensions do **not** already match a known ISO/non‑ISO size. `name` uses `metadata.iso || label`.

### 2. `src/lib/paperSizes.ts`
- Add `matchesAnySize(widthMm, heightMm, sizes: PaperSize[]): PaperSize | null` (reuse existing `matchesSize`, tolerant, orientation‑agnostic).

### 3. `src/pages/dashboard/OrderFiles.tsx`
- Consume `useResolvedAllowedCustomSizes` alongside the existing labels hook.
- Merge custom sizes into `allowedSizeNames` so downstream "allowed set" checks include them.
- Wherever the code decides "is this a recognised size?" before opening the advisory (lines ~877, 930, 985–991), also check `matchesAnySize(w, h, customSizes)`. A match should behave exactly like an ISO match: no advisory, treat as canonical size.
- Pass `allowedCustomSizes` through as a new prop on `<PaperSizeAdvisory>`.

### 4. `src/components/order/PaperSizeAdvisory.tsx`
- New prop `allowedCustomSizes?: PaperSize[]`.
- Prepend these to `orderedOptions` (before ISO suggestions) so they render as first‑class "Scale to Pull Up Banner (850 × 2000mm)" choices.
- Include their names in the allowed set used by `canKeepOriginal` / `matchKnownSize` fallback so an upload that already matches a custom size never lands here in the first place.

No changes to pricing, upload pipeline, or DB.

## Out of scope / follow‑up
- Reconciling the actual pull-up banner size (2000 vs 2200) in the master catalogue — needs your confirmation.
- Exposing a UI to add multiple custom sizes per product family (already possible via catalogue admin).
