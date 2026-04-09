
You are right: for a bi-fold this should be straightforward. The current preview is failing because the code is mixing up 3 different things that should be separate:

- sheet surface: outside vs inside
- fold progress: open vs folded
- viewing side of the folded brochure: front vs back

That mix-up is why the preview now feels inconsistent.

What is actually going on

1. Fold type can silently stay on bi-fold
- In `src/pages/dashboard/OrderBuild.tsx`, the preview only switches fold type if the selected Fold Type option exposes `metadata.fold_type`.
- If that metadata is missing/stale in the live product option data, the code falls back to the family slug, and brochures resolve to `bi_fold`.
- That cleanly explains “choosing any other fold does nothing”.

2. Front/back are being treated as states, not as views
- In `src/components/preview/brochure/brochure-specs.ts`, half-fold has separate states called `Front Cover` and `Back Cover`.
- Physically, that is wrong. A half-fold has one closed state; front and back are just opposite views of that same closed object.
- Because the code models them as separate states and also uses `flipScene`, the labels can end up reversed.

3. Brochure naming is muddy upstream
- In `src/components/order/PreviewPanel.tsx`, brochure sections use `front_cover` to mean “outside” and `back_cover` to mean “inside”.
- Then the renderer also uses front/back to mean the closed brochure’s front/back cover.
- So “front/back” is being used for two different concepts, which makes wiring it backwards very easy.

4. Source composition is still too generic
- `PreviewPanel.tsx` grabs contiguous page ranges for multi-panel layouts.
- `src/pages/dashboard/OrderFiles.tsx` also hardcodes 4-page panel assignment in a bi-fold-style way.
- So even with renderer fixes, some non-bi-fold layouts cannot compose correctly.

Plan to fix it properly

1. Fix fold-type resolution first
- Update `src/pages/dashboard/OrderBuild.tsx` so brochure fold type resolves in this order:
  1. `metadata.fold_type`
  2. selected option slug
  3. selected option label
- Add a temporary visible “active fold type” indicator near the preview while fixing this.
- Key/remount the preview by resolved `productType` so a fold change cannot stay visually stale.

2. Separate “outside/inside” from “front/back”
- In `src/components/order/PreviewPanel.tsx`, normalize brochure inputs immediately to:
  - outside surface
  - inside surface
- Keep `front_cover/back_cover` only as legacy section types in storage, not as renderer concepts.

3. Correct the half-fold physics
- In `src/components/preview/brochure/BrochureViewer.tsx` and `brochure-specs.ts`, make half-fold use:
  - Open
  - Closed
- Then add a separate viewer-side choice for the closed object:
  - View front
  - View back
- This removes the current front/back inversion.

4. Fix the stage camera instead of relabeling states
- In `src/components/preview/brochure/BrochureStage.tsx`, rotate the whole folded object from a centered camera wrapper.
- Closed front should show the front cover.
- The same closed fold, flipped, should show the back cover.

5. Make other fold types mechanically distinct
- In `src/components/preview/brochure/BrochureStage.tsx`, `FoldNode.tsx`, and `brochure-specs.ts`, make fold order and hinge direction drive the render.
- C-fold, Z-fold, and gate-fold need their own real sequences, not just different labels.

6. Make composition match the selected fold
- In `src/components/order/PreviewPanel.tsx`, support both:
  - 2-page outside/inside files
  - panel-per-page files
- In `src/pages/dashboard/OrderFiles.tsx`, make auto-assign recipes depend on the selected fold, not just page count.
- Show a clear mismatch warning when the uploaded layout does not match the chosen fold.

7. Stop hiding failures
- In `src/components/preview/FoldPreview.tsx`, stop swallowing slice/build errors silently.
- Show a small inline preview error if panel slicing/composition fails.

Files to update
- `src/pages/dashboard/OrderBuild.tsx`
- `src/pages/dashboard/OrderFiles.tsx`
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/FoldPreview.tsx`
- `src/components/preview/brochure/BrochureViewer.tsx`
- `src/components/preview/brochure/BrochureControls.tsx`
- `src/components/preview/brochure/BrochureStage.tsx`
- `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/brochure/brochure-specs.ts`
- `src/components/preview/brochure/brochure-types.ts`

Expected result
- Bi-fold closed front shows the real front cover.
- Bi-fold closed back shows the real back cover.
- Changing fold type visibly changes the preview because it no longer silently falls back to bi-fold.
- Tri-fold, Z-fold, and gate-fold each behave differently.
- Unsupported file/fold combinations show a clear warning instead of appearing broken.

Implementation order
1. Fix resolved fold type and force preview remount
2. Fix bi-fold front/back physics
3. Fix fold-aware source composition
4. Re-enable and verify tri-fold, Z-fold, and gate-fold on the corrected model
