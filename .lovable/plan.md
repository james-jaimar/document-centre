

## Problem Analysis

There are two issues:

### Issue 1: Wrong `insideFoldedAngle` values
The scene flip (`rotateY(180deg)` on the container) already **inverts** the visual direction of all child rotations. So to make a fold appear to go in the SAME visual direction on both surfaces, you need the SAME angle. To make it appear OPPOSITE, you flip the sign.

Currently the `insideFoldedAngle` values use opposite signs from `outsideFoldedAngle`, which means both surfaces animate identically (the flip + sign-change cancel out). The user wants:

- **C-fold**: Outside folds AWAY, inside folds TOWARD. Since the scene flip already inverts direction, using the **same** angles as outside will make them visually fold toward on inside. Fix: set `insideFoldedAngle` = `outsideFoldedAngle` for both panels.

- **Z-fold**: Same logic — the accordion shape viewed from the back should maintain its physical Z, just mirrored. Fix: set `insideFoldedAngle` = `outsideFoldedAngle` for both panels.

### Issue 2: Z-fold right panel shows visual change when it shouldn't
When the right panel folds AWAY (+180 on left hinge), it goes behind the center panel. But `FoldNode` sets `zIndex: 20` on any folded panel, causing behind-panels to render on top of the center panel. With `preserve-3d`, the browser should handle depth sorting — the explicit `zIndex` interferes with this.

## Changes

### File 1: `src/components/preview/brochure/brochure-specs.ts`

**C-fold** — change `insideFoldedAngle` to match `outsideFoldedAngle`:
- p0: `insideFoldedAngle: 180` → `-180`
- p2: `insideFoldedAngle: -180` → `180`

**Z-fold** — same fix:
- p0: `insideFoldedAngle: -180` → `180`
- p2: `insideFoldedAngle: -180` → `180`

### File 2: `src/components/preview/brochure/FoldNode.tsx`

Remove the `zIndex` from the panel wrapper. Let CSS 3D depth sorting handle which panels appear in front/behind naturally. This fixes the Z-fold right panel appearing on top when it should be behind.

