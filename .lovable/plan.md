
The next fix is not another angle tweak — it is a stacking/physics fix.

What is actually going wrong
- The fold motion is mostly correct now.
- The bad behavior happens at the end of the fold: once a flap reaches 180°, it becomes coplanar with the centre panel again.
- In `BrochureStage.tsx`, panels are still rendered in their original left-to-right DOM order, so browser paint order wins when two panels occupy the same plane.
- That is why a panel that should have gone behind can suddenly paint on top and “replace” the visible customer view.

Implementation plan

1. Make folded front/back placement explicit
- Update `src/components/preview/brochure/brochure-types.ts`.
- Extend `PanelFoldConfig` with per-surface folded layer data instead of relying only on angle:
  - whether the folded result ends in front of the visible sheet or behind it
  - optional fold sequence rank for cases where two folded flaps can overlap

2. Encode the real tri-panel physics in the specs
- Update `src/components/preview/brochure/brochure-specs.ts`.
- Use your described rules as the source of truth:
  - C-fold / roll-fold:
    - outside: folded flaps finish behind the visible face
    - inside: folded flaps finish in front of the visible face
    - when both are folded, the second fold must sit above the first on the visible side
  - Z-fold:
    - left panel finishes in front
    - right panel finishes behind
    - verify that this stays true on inside view too
  - gate fold: keep the same explicit front/behind rules so it cannot regress
  - half-fold: regression-check and keep current correct behavior

3. Render panels by physical layer, not spread order
- Update `src/components/preview/brochure/BrochureViewer.tsx` and `src/components/preview/brochure/BrochureStage.tsx`.
- Compute each panel’s active folded layer from:
  - current surface
  - open/folded state
  - panel fold config
- Render back-layer panels first, base sheet next, front-layer panels last.
- This prevents a “behind” flap from ever painting over the visible front panel at rest.

4. Add a tiny depth offset for folded resting states
- Update `src/components/preview/brochure/FoldNode.tsx`.
- Apply a very small `translateZ` based on the computed layer when a panel is folded.
- This avoids coplanar z-fighting at 180° and keeps the final resting stack stable.

Technical details
- Files to update:
  - `src/components/preview/brochure/brochure-types.ts`
  - `src/components/preview/brochure/brochure-specs.ts`
  - `src/components/preview/brochure/BrochureViewer.tsx`
  - `src/components/preview/brochure/BrochureStage.tsx`
  - `src/components/preview/brochure/FoldNode.tsx`
- `src/components/preview/FoldPreview.tsx` does not need a logic change for this issue; the artwork slicing/mapping is already the right model.
- The key correction is: final folded visibility must be explicit data, not an accidental side effect of CSS 3D painter order.

Verification
- Test each flap individually and then both together for:
  - tri-fold / C-fold
  - Z-fold
  - gate fold
- Confirm that any flap folding “to the back” stays hidden behind the currently visible surface when the animation finishes.
- Re-check inside/outside toggles after each fold type so the resting stack matches the physical fold pattern you described.
