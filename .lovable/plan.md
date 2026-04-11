

## Fix All Fold Types -- Definitive Spec

### Root Cause Analysis

Two independent bugs:

1. **Wrong fold angles** on several panels (they fold toward viewer instead of away, or vice versa)
2. **Depth offsets flip direction** when the scene wrapper is rotated 180° (for inside view or half-fold's auto-rotation). A panel with `translateZ(+2)` inside a scene rotated 180° visually appears BEHIND the base panel, not in front. This causes the folded panel to hide behind (or show through) the base panel incorrectly.

### CSS 3D Angle Reference (verified)

| Hinge edge | Positive angle | Negative angle |
|---|---|---|
| Left | AWAY from viewer | TOWARD viewer |
| Right | TOWARD viewer | AWAY from viewer |

When the scene is flipped 180° (inside view), visual directions reverse.

### Z-Fold Simplification

Per your spec: Z-fold is fully-open or fully-folded, no partial state. When folded, show a static single-panel image (front cover or back cover), not the 3D stacked panels. This avoids all the 3D stacking headaches for this fold type.

- Front of folded brochure = right panel's outside face
- Back of folded brochure = left panel's outside face

---

### File Changes

**1. `src/components/preview/brochure/brochure-specs.ts`**

Roll/C fold:
- p0 `outsideFoldedAngle`: `180` → `-180` (right hinge, was folding toward, needs to fold away)

Gate fold:
- p0 `outsideFoldedAngle`: `180` → `-180` (right hinge, fold away not toward)
- p0 `insideFoldedAngle`: `180` → `-180` (right hinge, with scene flip: -180 normally=away, flip→toward ✓)
- p3 `insideFoldedAngle`: `-180` → `180` (left hinge, with scene flip: +180 normally=away, flip→toward ✓)

Half-fold and Z-fold specs: **no angle changes** (half-fold angles are correct; Z-fold won't use animated folding)

**2. `src/components/preview/brochure/BrochureStage.tsx`**

Fix depth direction: negate `depthOffset` when `totalRotation` is effectively 180° (mod 360). This accounts for the scene flip reversing the Z-axis direction.

```typescript
const sceneFlipped = (Math.round(Math.abs(totalRotation) / 180) % 2) === 1;
// In the render loop:
const effectiveDepth = sceneFlipped ? -depthOffset : depthOffset;
```

**3. `src/components/preview/brochure/BrochureViewer.tsx`**

- Z-fold behavior: single boolean `isFullyFolded` state (not per-panel). When folded, render a static single-panel view instead of `BrochureStage`:
  - Shows front image by default (`outsideSpec.panels[2].front.imageUrl`)
  - "View Back" swaps to back image (`outsideSpec.panels[0].front.imageUrl`)
  - Surface toggle hidden when folded (folded brochure is one physical object)
- Keep existing bi_fold extraRotation logic unchanged (confirmed working)
- Keep existing roll/gate fold extraRotation logic unchanged (`rotatedFolded ? 180 : 0`)

**4. `src/components/preview/brochure/BrochureControls.tsx`**

- Accept `foldType` prop
- For `z_fold`: render single "Fold" / "Open" button instead of per-panel fold buttons
- Everything else unchanged

### Expected Results

| Fold | Outside | Inside |
|---|---|---|
| Half fold | Folds toward viewer, auto-shows front. "View Back" works | Folds toward viewer (via flip), auto-shows front |
| Roll/C fold | Both panels fold AWAY (behind). Right first, left second | Both panels fold TOWARD viewer. Right first, left second |
| Z-fold | Single "Fold" button → shows front cover. Flip for back | Same behavior (same physical object) |
| Gate fold | Both gates fold AWAY (behind) | Both gates fold TOWARD (in front) |

