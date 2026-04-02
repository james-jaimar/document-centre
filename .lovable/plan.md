

# Plan: Product Preflight, Orientation & Preview Enhancements

## Overview

Five interconnected improvements to the product workflow: US paper size handling, presentation orientation enforcement, binding edge support in previews, ring binder cover sizing, and brochure fold panel handling.

---

## 1. US Paper Size Advisory — Wire Up Properly

**Current state**: Detection exists (`detectNonIsoSize`), advisory dialog exists (`PaperSizeAdvisory`), scaling via `resize()` API exists. The flow already triggers after upload and offers "Scale to A4" or "Keep original". 

**What's missing**: After scaling, thumbnails aren't regenerated from the scaled PDF. The system updates dimensions in the DB but the preview still shows the original rasterized pages.

### Changes

**`src/hooks/useDocumentUpload.ts`** — After `resize()` completes, re-trigger `cropRasterize` + thumbnail polling on the new asset output, then update `thumbnail_urls` in the documents row.

**`src/pages/dashboard/OrderFiles.tsx`** — In `handleScaleTo`, after the resize job completes:
1. Call `reprocessDocument` or a new `reThumbnail` helper that fetches fresh derived files from the resized asset
2. Update `thumbnail_urls` in the DB with the new paths
3. Invalidate queries so the preview refreshes

This ensures the entire pipeline honors the new size: PDF scaled → new thumbnails → preview updates → pricing uses correct dimensions.

---

## 2. Presentation Orientation Enforcement

**Current state**: Presentations are seeded with landscape sizes but nothing validates that uploaded files are actually landscape.

### Changes

**`src/pages/dashboard/OrderFiles.tsx`** — New orientation check after upload processing:
- If the product family slug is `"presentations"` and the uploaded document's `page_width_mm < page_height_mm` (portrait), show a new **`OrientationAdvisory`** dialog
- Options: **"Rotate to Landscape"** (calls `rotate(assetId, 90)` → re-thumbnail) or **"Switch to Bound Documents"** (navigates to product selection with the file)

**New component: `src/components/order/OrientationAdvisory.tsx`**
- Warning dialog: "This file is portrait. Presentations require landscape orientation."
- Two buttons: "Rotate 90°" and "Use Bound Documents instead"
- On rotate: call `rotate()` API, poll job, re-fetch thumbnails, update dimensions (swap w/h), update `preflight_data`

---

## 3. Binding Edge Support (Top vs Left/Short Edge)

**Current state**: FlipBook always renders binding on the left edge. Presentations need top-edge binding for A4/A5 and left-edge (short-edge) binding for A3.

### Changes

**`src/components/preview/previewTypes.ts`**:
- Add `bindingEdge?: "left" | "top"` to `FlipBookProps` and `PreviewComponentProps`

**`src/components/preview/FlipBook.tsx`**:
- Accept `bindingEdge` prop
- When `bindingEdge === "top"`:
  - Rotate the entire flipbook container 90° via CSS transform
  - Spine image renders horizontally across the top
  - Page flip direction changes to vertical (react-pageflip doesn't natively support vertical — we use CSS rotation of the container as a workaround)
- When `bindingEdge === "left"` (default): current behavior

**`src/components/preview/BindingSpine.tsx`**:
- Add horizontal rendering mode for top-edge binding (spine image rotated 90°)

**`src/pages/dashboard/OrderBuild.tsx`**:
- Derive `bindingEdge` from the selected Document Size option metadata:
  - If metadata contains `binding_edge: "top"` → pass `bindingEdge="top"`
  - If metadata contains `binding_edge: "short"` → pass `bindingEdge="left"` (short edge = left for landscape)
  - Default: `"left"`
- Pass through to `DocumentPreview` → `FlipBook`

**`src/components/preview/DocumentPreview.tsx`**:
- Accept and forward `bindingEdge` prop to `FlipBook`

**Note**: You mentioned you'll supply rotated binding images for top-bound — the code will reference asset paths like `coil_binding_black_closed_horizontal.png` which you can drop in later.

---

## 4. Ring Binder Cover Background

**Current state**: Ring binder uses the same FlipBook preview as other bound types. No binder-specific visuals.

### Changes

**`src/components/preview/FlipBook.tsx`** / new **`RingBinderPreview.tsx`**:
- When `bindingType === "wire"` AND product family is `"ring_binders"`:
  - Render a binder background image (placeholder initially) behind the page stack
  - Cover page renders at ~270×320mm aspect ratio (you'll provide the exact dimensions)
  - Inner pages render at standard A4 within the binder frame
  - The binder image acts as a static background with pages overlaid

**Deferred until you provide**:
- Exact cover dimensions (you mentioned ~270×320mm)
- Binder background image asset

**Immediate work**: Add the `ringBinderCoverMm` config to previewTypes and the rendering shell in a new `RingBinderPreview` component, with a placeholder gray binder outline until assets arrive.

---

## 5. Brochure/Folded Leaflet Panel Handling

**Current state**: `FoldPreview.tsx` shows panels using `urls[0..N]` mapped to fold geometry. It assumes one thumbnail per panel.

### Analysis of what the backend can do

The Document Centre API has these relevant operations:
- `resize` — scale pages
- `nup` — impose multiple pages onto sheets
- `imposeSheet` / `booklet` — rearrange for print imposition

**For brochures, the approach should be**:

A brochure is typically a **single sheet printed both sides**. A bi-fold A4 = 1 sheet, 4 panels (2 per side). The uploaded PDF should have 2 pages (front and back of the sheet), and each page shows 2 panels side by side.

### Changes

**`src/components/preview/FoldPreview.tsx`**:
- Enhanced to handle the actual panel/page mapping:
  - **Bi-fold**: 2-page PDF → Page 1 = outside (panels 1,4), Page 2 = inside (panels 2,3). Split each page thumbnail into panel regions using CSS `object-position` + `object-fit: cover` clipping
  - **Tri-fold**: 2-page PDF → 3 panels per side, 6 panels total. Each panel clips 1/3 of the page width
  - **Z-fold**: Same as tri-fold but fold direction differs (handled in animation)
  - **Gate-fold**: 2-page PDF → 4 panels per side. Panel widths follow FOLD_GEOMETRY ratios

- Add a "Front" / "Back" toggle to show both sides of the sheet
- CSS-based panel clipping from full-page thumbnails (no need to split PDFs server-side)

**`src/components/preview/previewTypes.ts`**:
- Document that brochure thumbnails use full-page images, with panel extraction done client-side via CSS clipping

---

## Files Summary

| File | Action |
|------|--------|
| `src/hooks/useDocumentUpload.ts` | Modify — add post-resize re-thumbnail logic |
| `src/pages/dashboard/OrderFiles.tsx` | Modify — wire up re-thumbnail after scale, add orientation check |
| `src/components/order/OrientationAdvisory.tsx` | New — portrait warning dialog for presentations |
| `src/components/preview/previewTypes.ts` | Modify — add `bindingEdge` prop |
| `src/components/preview/DocumentPreview.tsx` | Modify — forward `bindingEdge` |
| `src/components/preview/FlipBook.tsx` | Modify — support top-edge binding via CSS rotation |
| `src/components/preview/BindingSpine.tsx` | Modify — horizontal mode for top binding |
| `src/pages/dashboard/OrderBuild.tsx` | Modify — derive `bindingEdge` from option metadata |
| `src/components/preview/RingBinderPreview.tsx` | New — placeholder binder shell (awaiting assets) |
| `src/components/preview/FoldPreview.tsx` | Modify — CSS panel clipping, front/back toggle |

## Implementation Order
1. Fix post-resize thumbnail regeneration (US paper size flow)
2. Add orientation advisory for presentations
3. Add binding edge support to preview system
4. Create ring binder preview shell (placeholder)
5. Enhance fold preview with panel clipping

## Things You Flagged That I Should Note

- **Binding images for top-bound**: You'll supply rotated coil/wire images — code will reference them and fall back to current images until provided
- **Ring binder cover dimensions**: ~270×320mm — you'll confirm exact size and provide a binder background image
- **One thing you may have missed**: The brochure fold preview should probably also validate page count on upload — a bi-fold should be exactly 2 pages, tri-fold exactly 2 pages, etc. If the user uploads a 10-page PDF into a brochure product, we should warn them. I'll add that validation alongside the orientation check.

