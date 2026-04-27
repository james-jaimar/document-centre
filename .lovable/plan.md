## Goal
Remove the "Bind on long edge (top)" option entirely. Users who want long-edge binding simply upload a landscape document, which is then bound on its short (left) edge — visually identical to the long-edge-bound portrait case, without any rotated layout or stacked-page logic.

## Changes

### 1. `src/pages/dashboard/OrderBuild.tsx`
- Remove the toggle UI block (lines 807–820): the `<label>` + checkbox for "Bind on long edge (top)".
- Remove `landscapeLongEdge` derivation (line 472) and the `canToggleLongEdge` flag (line 475).
- Remove `handleToggleLongEdge` callback (lines 477–482).
- Stop passing `landscapeLongEdge` to `<PreviewPanel>` (line 827).
- Optionally: clear any persisted `binding_edge_override === "long"` from spec on mount (or leave it inert — it just won't be read anywhere).

### 2. `src/components/order/PreviewPanel.tsx`
- Remove the `landscapeLongEdge` prop from the interface (lines 30–32) and destructure (line 243).
- Remove it from the two pass-throughs to `DocumentPreview` (lines 708, 730).

### 3. `src/components/preview/DocumentPreview.tsx`
- Remove the `landscapeLongEdge` prop (lines 32–34, 63) and stop forwarding it to `<FlipBook>` (line 178).

### 4. `src/components/preview/FlipBook.tsx`
- Remove the `landscapeLongEdge` prop and the `isStacked` branch entirely.
- Delete the 90° container rotation, the inverse-aspect-ratio path, the `wrapperWidth/wrapperHeight` rotated-footprint math, and the `counterRotate` / `artworkAspect` plumbing into `FlipPage`.
- All landscape documents render as a normal side-by-side spread; `bindingEdge==="top"` (set for landscape sizes) continues to drive short-edge spine artwork selection only.

### 5. `src/components/preview/BindingSpine.tsx`
- Remove the `landscapeLongEdge` prop (lines 22–28, 48).
- Simplify edge resolution: drop the `"top"` branch — only `"long"` (portrait/left bind) and `"short"` (landscape/left bind on short edge) remain.

### 6. `src/components/preview/previewTypes.ts`
- Remove `landscapeLongEdge?: boolean` from `FlipBookProps` and the surrounding doc comments.

### 7. `src/components/preview/bindingAssets.ts`
- Remove the `top` edge entry from the registry (the horizontal landscape PNGs registered last round). The 10 imported asset files can be left in `src/assets/bindings/` (harmless) or deleted — I'll delete them to keep the bundle clean.

### 8. `src/lib/orders/buildPreviewSnapshot.ts` and consumers (`CustomerOrderDetail.tsx`, `JobDetailPanel.tsx`)
- These pass `bindingEdge` only (no `landscapeLongEdge`), so no changes needed beyond confirming nothing reads the override.
- Audit `binding_edge_override` references — if only `OrderBuild.tsx` writes "long", the field becomes dead. Leave the column in place (no migration) but stop reading/writing it.

## Verification
- Type-check (`tsc --noEmit`).
- Manually confirm in preview:
  - Portrait bound document → side-by-side spread with vertical long-edge spine (unchanged).
  - Landscape bound document → side-by-side spread with vertical short-edge (210mm) spine, normal sizing — no rotation, no microscopic preview, no stacked layout.

## Memory updates
- Update `mem://features/preview-system/architecture` to remove references to top-edge stacked layout and the long-edge toggle.
