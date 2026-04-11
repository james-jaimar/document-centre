

## Fix: Half-fold "View Back" shows wrong image

### Root Cause

When the half-fold is folded and the user clicks "View Back", the scene rotation goes to 0°. At 0°, we're looking at the front side of the stage. Panel p1 (folded -180°) exposes its CSS **back face**, which contains inside artwork (mapped via `insideSlices[n-1-i]`). The user expects to see the **outside left panel** (p0's front face = back cover), but instead sees inside artwork.

No amount of scene rotation fixes this because the CSS back face of p1 will always contain inside artwork (that's how the inside view works — flip scene 180° to reveal back faces with inside images).

### Fix

Use the same approach as Z-fold: when the half-fold is folded and showing the "back", render a **static single-panel view** of p0's front face (outside left = back cover) instead of trying to use 3D rotation. When showing the "front", render p1's front face (outside right = front cover).

**`src/components/preview/brochure/BrochureViewer.tsx`**

Add a static view block for half-fold when folded (before the main return), similar to the Z-fold block:

- When `isHalfFold && anyFolded`:
  - `showingFront = !rotatedFolded` → display p1's front face (front cover)
  - `showingBack = rotatedFolded` → display p0's front face (back cover)
  - Render as a static single panel with shadow, same pattern as the Z-fold folded view
  - Include controls and a label ("Front/Back of folded brochure")
  - Panel aspect ratio: `sheetRatio * 0.5` (half the sheet width)

Remove the `extraRotation` half-fold branch entirely since half-fold folded state is now handled by the static view. The `extraRotation` simplifies to just `rotatedFolded ? 180 : 0` for tri/gate folds.

One file change.

