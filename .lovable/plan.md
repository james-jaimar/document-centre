

# Plan: Fix Brochure Fold Preview — Three Remaining Issues

## Issues

### Issue 1: Clicking "Front Cover" folds wrong direction, shows inside as the back
The half-fold spec has `rootPanelIndex: 0` (Panel 0 = back cover, fixed). Panel 1 (front cover) rotates `-180` — this folds left-to-right, rotating around Panel 1's LEFT edge. When folded, the CSS back-face of Panel 1 is visible — but Panel 1's `back` contains the **inside** artwork (from `buildPanelsWithArtwork` line 61: `back: insideSlices[n-1-i]`). 

The fix: For half-fold, Panel 1 should fold **right-to-left** (close like a book). This means either using `+180` rotation (fold toward viewer) or changing the root to Panel 1 and folding Panel 0. Additionally, we need a **"Back Cover"** state so the user can see both closed faces.

The half-fold spec needs:
- **Open** (both panels flat)
- **Front Cover** (closed, showing Panel 1's front = right half of outside surface)
- **Back Cover** (closed, showing Panel 0's front = left half of outside surface)

### Issue 2: "Show Inside" works correctly
Good — no changes needed for the inside surface swap.

### Issue 3: Changing fold type does nothing
The `productType` is determined in `OrderBuild.tsx` by reading the selected "Fold Type" option's `metadata.fold_type`. This maps through `SLUG_TO_PREVIEW` to set `productType` to `"bi_fold"`, `"tri_fold"`, etc.

The `FoldPreview` receives `foldType={productType}` and uses `FOLD_GEOMETRY[foldType].widths` to slice panels. But `FOLD_GEOMETRY` defines different panel counts per fold type (2 for bi-fold, 3 for tri/z, 4 for gate). The slicing and spec rebuild happens in `buildSpecs` which depends on `[urls, foldType, geometry.widths, hasTwoSides]`.

The issue is that the **composed surface images** (`composePanelImages`) are built in `PreviewPanel.tsx` using `foldSectionData` which hardcodes bi-fold page indices (lines 254-261: pages 0,3 for outside, pages 1,2 for inside). When the fold type changes to tri-fold, the same bi-fold page mapping is used, and `FOLD_GEOMETRY` changes the width fractions — but the **source image is still composed from 2 panels**, not 3.

The root issue: `foldSectionData` in `PreviewPanel.tsx` hardcodes bi-fold page ranges. For tri-fold (6 pages), the outside would be pages 0,1,2 and inside pages 3,4,5. For gate-fold (4 pages but different layout), different mapping.

## Plan

### 1. Fix half-fold closing animation and add Back Cover state
**`src/components/preview/brochure/brochure-specs.ts`**

Change half-fold states to:
- Open: `{ p0: 0, p1: 0 }`
- Front Cover: `{ p0: 0, p1: -180 }` (keep as-is, but fix the back-face artwork)
- Back Cover: `{ p0: 0, p1: -180 }` — same fold, but we need a way to "flip" to see the other side

Actually, the real fix: when Panel 1 folds -180 around its left edge (which is hinged to Panel 0's right edge), Panel 1's CSS **back-face** becomes visible. So Panel 1's `back` must show the **front cover** artwork when viewed from behind — but physically that's just the front cover seen through the back of the fold.

The simplest correct approach: for the "Front Cover" closed state, the visible face after -180 rotation is Panel 1's **back** CSS face. So we need Panel 1's `back.imageUrl` to be the outside right panel (front cover), **not** the inside artwork.

Wait — when a panel rotates -180°, the CSS `backfaceVisibility: hidden` hides the front face and shows the back face. So `panel.back` is what's visible. Currently `panel.back` = `insideSlices[n-1-i]` = inside left panel. That's why it shows inside content.

**Fix in `FoldPreview.tsx`** (`buildPanelsWithArtwork`): For outside panels, the `back` face should NOT be the inside artwork. Instead, it should be the **same outside slice** (mirrored/same image) because when you close a brochure and look at it from the front, you see the outside of that panel. The back CSS face of Panel 1 should show the outside Panel 1 artwork (front cover).

Actually, physically: when Panel 1 folds flat onto Panel 0, looking from the front you see Panel 1's outside (the front cover). But in CSS 3D, a -180° Y rotation means the CSS back-face is now facing you. So `panel.back` needs to have the front cover image.

**Solution**: Set each outside panel's `back.imageUrl` to the same `outsideSlices[i]` (mirrored horizontally, since it's the reverse of the same physical face). Or more simply: use `scaleX(-1)` on the back face image.

Actually no — the outside of a panel is a single printed surface. When you see it from the front or back, you see the same artwork (just mirrored if looking through). In CSS 3D with `backface-visibility: hidden`, the back div is a separate element rotated 180°. For a physically correct closed view, `panel.back` should contain the **outside** artwork of that same panel.

**Revised approach**: 
- Outside panels: `front` = outsideSlice[i], `back` = outsideSlice[i] (same image — it's the same physical surface seen from behind)
- Inside panels: `front` = insideSlice[i], `back` = insideSlice[i]

This way, when Panel 1 folds -180°, the back-face shows the front cover (outsideSlice[1]) — correct.

For the "Back Cover" state, we add a new state where the viewer can see Panel 0's front face. Since Panel 1 is folded on top, we need to either:
- Add a state label "Back Cover" that shows the same fold but from behind (scene rotated), OR
- Simply note that "Show Inside" with closed state shows the back

Simpler: add a third outsideState "Back Cover" that keeps Panel 1 at -180 but the user is told they're seeing the back. We can implement this by having the BrochureViewer detect the "Back Cover" state and apply a scene-wide `rotateY(180deg)` — just for that one state.

Even simpler: since Panel 0's front face IS the back cover and it's always visible (it's the root, never folded), the "Back Cover" view = fold Panel 1 to -180 and look at Panel 0. But Panel 1 stacks on top of Panel 0 visually. We need Panel 0 to be visible.

Best approach: Add a `rotateY(180deg)` on the whole stage for the "Back Cover" state. This flips everything so Panel 0's front (back cover) faces the viewer, and Panel 1 (folded) is behind it.

### 2. Fix fold-type-dependent page mapping in PreviewPanel
**`src/components/order/PreviewPanel.tsx`** (`foldSectionData` memo)

Currently hardcoded for bi-fold (4 pages: outside=0,3 inside=1,2). Need to make this fold-type-aware:

- **bi_fold** (4 pages): outside = pages 0,3; inside = pages 1,2
- **tri_fold** (6 pages): outside = pages 0,1,2; inside = pages 3,4,5
- **z_fold** (6 pages): outside = pages 0,1,2; inside = pages 3,4,5
- **gate_fold** (4 pages): outside = pages 0,1; inside = pages 2,3 (or similar — needs to match the physical sheet)

Actually, the page ordering depends on how the PDF is structured. Typically for brochures, a 4-page PDF has: page 1 = outside surface, page 2 = inside surface. Each page shows the full flat sheet. So a bi-fold with 2 pages in the PDF = outside (page 0) + inside (page 1), each being a full A4 landscape.

Looking at the existing code, when `pageCount === 4 && start === 0 && end === 3`, it picks pages 0 and 3. This suggests a 4-page PDF where each page is one panel. But the compose function stitches them side by side.

The real question: what does the uploaded PDF look like? From the screenshots, it appears to be a 2-page PDF where page 1 = full outside surface and page 2 = full inside surface. In that case, `composePanelImages` is not needed — each page IS a complete surface.

Looking at the `isMultiPanel` logic: if `start === end` or `end` is null, it's single-page (one URL = one complete surface). The multi-panel path is for when separate panel images need compositing.

For the fold type switching issue: when `productType` changes (e.g., from `bi_fold` to `tri_fold`), the `foldSectionData` re-evaluates. But the sections and documents don't change — the same PDF with the same thumbnails is used. The `getThumbsForSection` function uses `section.page_range_start` and `section.page_range_end` which are set by the order builder.

If the section data doesn't change when fold type changes, then `foldSectionData` produces the same URLs regardless of fold type. The `FoldPreview` then slices the same composed images with different `widthFractions` — which should work for simple cases where outside = page 1 image, inside = page 2 image.

So the fold type switch should work if the slicing is the only thing that changes. Let me re-check... `buildSpecs` depends on `[urls, foldType, geometry.widths, hasTwoSides]`. If `foldType` changes, `geometry.widths` changes, and `buildSpecs` re-runs. But `urls` (the `foldThumbnails`) stays the same.

The `buildSpecs` function calls `buildSpecForFoldType(foldType)` which returns a spec with different panel counts. Then it slices the composed image using the new widths. This should produce different panel counts and widths.

Wait — the `urls` array doesn't change, but `buildSpecForFoldType` returns 3 panels for tri-fold. The `sliceImageIntoPanels` uses `geometry.widths` which has 3 entries for tri-fold. So it should create 3 slices. And `buildPanelsWithArtwork` maps them to 3 panels.

So theoretically it should work. Let me check if `geometry` is computed correctly... `const geometry = FOLD_GEOMETRY[foldType]` — this uses the prop `foldType` which comes from `productType`. If `productType` updates when the option changes, it should work.

Let me check if maybe there's a React key issue — the BrochureViewer might not re-render when specs change. Looking at BrochureViewer: it has `useEffect` that resets on `foldType` change. And `activeSpec` is derived from the spec prop.

Actually, the issue might be that `FoldPreview` uses `useState` for `outsideSpec`/`insideSpec` and `useCallback` for `buildSpecs`. The `useCallback` depends on `[urls, foldType, geometry.widths, hasTwoSides]`. If `foldType` changes but `urls` doesn't (because the same thumbnails are used), it should still re-run because `foldType` is in the deps.

But wait — `geometry.widths` is an array. Arrays are compared by reference in React deps. `FOLD_GEOMETRY[foldType].widths` returns a new array reference each time... actually no, it returns the same constant array. So if `foldType` changes, `geometry` changes (different object), and `geometry.widths` changes (different array reference). So `buildSpecs` should re-run.

Hmm, let me think about this differently. Maybe the issue is that `buildSpecs` runs but the slicing fails silently? Or maybe the fold type option doesn't actually change `productType`?

I should check the console. Actually, let me just check if there's a CORS issue with the canvas slicing for the second run... No, that would fail the first time too.

Let me look more carefully: `FOLD_GEOMETRY` is declared as a const object — the `.widths` arrays inside are stable references. But when `foldType` changes, `geometry` points to a different entry, so `.widths` is a different array. So the `useCallback` deps do change.

The most likely issue: the fold type option might not propagate to `productType`. Let me re-check OrderBuild.tsx logic...

Lines 268-283 in OrderBuild.tsx: it looks for `foldOption` by name "fold type", finds the selected slug, looks up metadata.fold_type. If this doesn't match one of the SLUG_TO_PREVIEW keys, it falls through.

The SLUG_TO_PREVIEW map (lines 76-84) has: `bi_fold: "bi_fold"`, `tri_fold: "tri_fold"`, `z_fold: "z_fold"`, `gate_fold: "gate_fold"`. And the product option values have `fold_type: "bi_fold"` etc in metadata.

So the chain is: user selects "Tri-Fold" option → slug changes → metadata.fold_type = "tri_fold" → SLUG_TO_PREVIEW["tri_fold"] = "tri_fold" → productType = "tri_fold".

This should work. But maybe the issue is that the fold type option values in the DB don't have the correct metadata. The seed file shows the metadata, but if the DB wasn't re-seeded...

Actually, the user said "only half fold does anything, selecting any other fold type does nothing." This could mean the productType doesn't change, OR the preview doesn't visually change enough to notice (since it's the same two surface images just sliced differently).

For now, I'll assume the productType propagation works and focus on making the visual output clearly different per fold type. The main visible issue would be: tri-fold should show 3 panels, but if the source is a bi-fold brochure (only 2 surfaces), the slicing just divides the same image into 3 parts instead of 2 — which would look different.

I think the likely real issue is simpler: the user uploaded a bi-fold brochure but is testing by changing fold type. The preview does update visually (3 slices instead of 2), but the folding animation doesn't work for tri-fold because the hinge tree structure has bugs for non-root-0 panels.

Looking at BrochureStage: for tri-fold, `rootPanelIndex = 1`. The right chain builds panels 2 (from index 2 down to rootPanelIndex+1=2, so just panel 2). The left chain builds panels 0 (from 0 to rootPanelIndex-1=0, just panel 0). Panel 1 is root. This looks correct structurally.

But the left chain loop: `for (let i = 0; i < rootPanelIndex; i++)` — this iterates i=0 only. It wraps panel 0 in a FoldNode with `leftChild={leftTree}` where leftTree starts as null. So panel 0 is just a single FoldNode. That's correct.

The positioning: root is at `left: rootOffsetX` where `rootOffsetX = panelWidths[0]`. Panel 0 is `leftChild` of root, positioned at `right: width` (root's width), so it appears to the left. Panel 2 is `rightChild`, at `left: width`. This seems correct.

Rotations for tri-fold "Flap Closed": `{ p0: 0, p1: 0, p2: -180 }`. Panel 2 rotates -180 around its left edge (hinged to root's right). This should fold panel 2 onto panel 1. But the transform origin is always "left center" in FoldNode. For rightChild, the wrapper div doesn't set transformOrigin... actually the FoldNode itself has `transformOrigin: "left center"` which is correct for a right child (hinge at left edge of child = right edge of parent).

For the left child (panel 0), the FoldNode also has `transformOrigin: "left center"`. But panel 0 should hinge at its RIGHT edge (where it connects to panel 1). The wrapper has `transformOrigin: "right center"` but that's on the wrapper, not on the FoldNode's own div. The FoldNode's own transform origin is "left center" always. This is wrong for left-side panels.

**This is the bug for non-bi-fold types**: Panel 0 (left of root) should rotate around its RIGHT edge, but FoldNode always uses `transformOrigin: "left center"`.

### 3. Fix FoldNode transform origin for left-side panels
**`src/components/preview/brochure/FoldNode.tsx`**

Add a prop `hingeEdge: "left" | "right"` and set `transformOrigin` accordingly.

**`src/components/preview/brochure/BrochureStage.tsx`**

Pass `hingeEdge="right"` for left-chain panels, `hingeEdge="left"` for right-chain panels.

## Summary of changes

### `src/components/preview/FoldPreview.tsx`
- Fix `buildPanelsWithArtwork`: set `panel.back.imageUrl = outsideSlices[i]` for outside panels (same artwork on back CSS face so folded view shows the correct surface)
- For inside panels: `panel.back.imageUrl = insideSlices[i]`

### `src/components/preview/brochure/brochure-specs.ts`
- Add "Back Cover" state to half-fold: same rotations as Front Cover but with a `flipScene: true` flag
- Add `flipScene?: boolean` to FoldState type

### `src/components/preview/brochure/brochure-types.ts`
- Add `flipScene?: boolean` to `FoldState` interface

### `src/components/preview/brochure/FoldNode.tsx`
- Add `hingeEdge` prop (`"left" | "right"`, default `"left"`)
- Use it for `transformOrigin`

### `src/components/preview/brochure/BrochureStage.tsx`
- Pass `hingeEdge="right"` for left-chain FoldNodes
- Pass `hingeEdge="left"` for right-chain FoldNodes
- Apply `rotateY(180deg)` to outer wrapper when `state.flipScene` is true

### `src/components/preview/brochure/BrochureViewer.tsx`
- Pass `flipScene` from current state to BrochureStage (already handled if BrochureStage reads it from the state prop)

## Files to change
- `src/components/preview/FoldPreview.tsx`
- `src/components/preview/brochure/brochure-specs.ts`
- `src/components/preview/brochure/brochure-types.ts`
- `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/brochure/BrochureStage.tsx`

