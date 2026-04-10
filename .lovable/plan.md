

## Fix: "Show Inside" displays same images as outside

### Root cause

The `BrochureViewer` does two conflicting things when toggling to "inside":
1. Swaps to `insideSpec` (whose front faces have inside artwork, back faces have outside artwork)
2. Flips the entire scene 180° via `flipScene`, which makes **back faces** visible

These cancel out: flipping reveals the back faces of `insideSpec`, which contain **outside** artwork. The user sees the same images.

### Solution

Always use `outsideSpec`. The 180° scene flip already handles the inside view correctly:
- Back faces of `outsideSpec` panels contain inside artwork at reversed indices
- The scene flip reverses the visual panel order, un-reversing the indices
- Result: inside artwork displays left-to-right in the correct order

### Changes

**`src/components/preview/brochure/BrochureViewer.tsx`**
- Line 32: Change `activeSpec` to always use `outsideSpec` regardless of surface
- Remove the conditional `insideSpec` selection

**`src/components/preview/FoldPreview.tsx`** (cleanup)
- Still build `insideSpec` and pass it (for `hasTwoSides` detection), but it won't be rendered
- Alternatively, simplify by passing a `hasTwoSides` boolean prop instead of `insideSpec`

This is a one-line fix in the viewer.

