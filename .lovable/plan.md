

## Fix Half-Fold Physics and Add Folded Rotation

### Problem
1. **Z-fighting**: When the half-fold panel folds over the root, they overlap/flicker at 180° (same coplanar issue as tri-folds)
2. **Wrong inside fold direction**: `insideFoldedAngle` is `-180`, which with the scene flip causes the panel to fold away instead of toward the viewer. Inside folded should show the outside front cover on top.
3. **Missing "rotate folded" control**: Once folded, the customer should be able to rotate the folded leaflet to see front and back of the finished fold — this is different from "Show Inside/Outside" which changes the starting surface.

### Physical behavior (half-fold)
- **Outside, folded**: Right panel (front cover) folds left on top of left panel (back cover). Customer sees the front cover. Should be able to rotate to see the back cover.
- **Inside, folded**: Right panel folds toward viewer, landing in front. Its back face shows the outside front artwork. Customer sees the outside front.

### Changes

**`src/components/preview/brochure/brochure-specs.ts`**
- Change half-fold `insideFoldedAngle` from `-180` to `180` so the inside fold visually comes toward the viewer (matching outside behavior after scene flip inversion)

**`src/components/preview/brochure/BrochureViewer.tsx`**
- Add a `rotatedFolded` boolean state (default false)
- When `rotatedFolded` is true, apply an additional 180° Y rotation to the scene (stacks with the existing `flipScene` rotation)
- Reset `rotatedFolded` when fold state or surface changes
- Pass `rotatedFolded` toggle handler and state to controls

**`src/components/preview/brochure/BrochureStage.tsx`**
- Accept new `extraRotation` prop (0 or 180)
- Add it to the camera wrapper transform: `rotateY(${flipScene ? 180 : 0 + extraRotation}deg)`

**`src/components/preview/brochure/BrochureControls.tsx`**
- Add a "Rotate" button that appears when at least one panel is folded
- Shows "View Back" / "View Front" label
- Triggers the rotation toggle

No changes to FoldNode or brochure-types — the existing depth offset logic already handles the half-fold case since `outsideLayer: "front"` with `foldSequence: 1` gives a positive translateZ.

