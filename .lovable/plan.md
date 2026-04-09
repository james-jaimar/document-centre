
What I found

- The current brochure preview is still mixing 3 different things together: the sheet surface (`outside/inside`), the fold progression (`open/step/closed`), and the viewing side of the folded object (`front/back`).
- In `brochure-specs.ts`, half-fold “Front Cover” and “Back Cover” are defined as two linear states, but “Back Cover” is just the same closed fold plus `flipScene`. In `BrochureStage.tsx`, that flip is applied to the root-positioned wrapper instead of a true full-stage camera wrapper, so the wrong cover can stay visible.
- `FoldPreview.tsx` only builds `outsideSpec` and `insideSpec`. That is enough for sheet-side swapping, but not enough to model “closed front cover” vs “closed back cover” cleanly.
- Non-bi-fold types still do not meaningfully differ because the renderer never uses `spec.hinges.direction`; `BrochureStage.tsx` only builds generic left/right chains. So C-fold, Z-fold, and gate-fold are reduced to almost the same behavior.
- `PreviewPanel.tsx` still has a hard bi-fold special case for 4-page panel layouts (`0,3` and `1,2`), so the selected fold type and the source panel composition can get out of sync.

Plan

1. Separate fold progression from viewing side
- Refactor the brochure viewer so it tracks:
  - sheet surface: outside / inside
  - fold progression: open / intermediate / closed
  - viewing side when closed: front / back
- For half-fold, “Front Cover” and “Back Cover” will become the same closed fold viewed from opposite sides, not two loosely-related labels.

2. Fix the flip logic so front/back are not reversed
- Move scene flipping out of the root-positioned wrapper in `BrochureStage.tsx`.
- Add a proper stage-level camera wrapper that rotates around the center of the folded brochure.
- Keep panel/root positioning inside that wrapper so closed-front and closed-back become true opposite views of the same physical fold.

3. Make fold types actually behave differently
- Update `BrochureStage.tsx` / `FoldNode.tsx` to use `spec.hinges.direction` for rotation direction, stacking, and fold order.
- Rework `brochure-specs.ts` so each fold type has a real physical state sequence:
  - bi-fold: open -> closed
  - tri-fold C: open -> flap closed -> closed
  - z-fold: open -> first fold -> closed
  - gate-fold: open -> gates closed
- This is the key fix for “other fold types do nothing”.

4. Make source composition fold-type-aware
- Update `PreviewPanel.tsx` so brochure source building is based on the selected fold type, not just the old bi-fold assumptions.
- Support both:
  - full-sheet uploads (outside page + inside page), sliced according to the chosen fold
  - panel-per-page uploads (4/6-page layouts), composed according to the chosen fold
- If the uploaded artwork layout does not match the selected fold type, show a clear mismatch message instead of silently rendering a misleading preview.

5. Simplify the controls to match the physical action
- Replace the current generic prev/next label flow for closed brochure views with clearer controls:
  - Open / Fold step / Closed
  - Flip brochure (front/back) when closed
  - Show Inside / Show Outside for the sheet surface
- This matches your requirement: fold it first, then flip it over to see the other cover.

Files to update
- `src/components/preview/FoldPreview.tsx`
- `src/components/preview/brochure/BrochureViewer.tsx`
- `src/components/preview/brochure/BrochureControls.tsx`
- `src/components/preview/brochure/BrochureStage.tsx`
- `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/brochure/brochure-specs.ts`
- `src/components/preview/brochure/brochure-types.ts`
- `src/components/order/PreviewPanel.tsx`

Expected result
- Front Cover shows the actual front cover, and Back Cover shows the actual back cover.
- Closed brochure views behave correctly: fold first, then flip the brochure over.
- Tri-fold, Z-fold, and gate-fold visibly behave differently instead of feeling unchanged.
- If the source artwork cannot support the selected fold type, the UI says so clearly instead of appearing broken.
