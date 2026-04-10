

## The Problem

In `buildPanelsWithArtwork()` (FoldPreview.tsx lines 48-68), both CSS faces (front and back) of every panel are assigned the **same** surface image. When a panel folds 180°, CSS `backface-visibility: hidden` hides the front face and reveals the back face — but since both have identical artwork, the fold appears to show the same image instead of the reverse side of the sheet.

## The Fix

**One file change: `src/components/preview/FoldPreview.tsx`**

Rewrite `buildPanelsWithArtwork` so that:

- **Outside panels**: front face = outside artwork slice, back face = corresponding inside artwork slice (horizontally mirrored, since you're looking through the sheet)
- **Inside panels**: front face = inside artwork slice, back face = corresponding outside artwork slice (mirrored)

When there is no inside artwork (single-sided upload), the back face falls back to a plain grey/muted placeholder instead of duplicating the front.

### Panel index mapping for the back face

When you physically flip a panel, the inside panel positions are reversed left-to-right. For a 3-panel sheet:
- Outside panel 0 (left) → its back shows Inside panel 2 (right), mirrored
- Outside panel 1 (centre) → its back shows Inside panel 1 (centre), mirrored  
- Outside panel 2 (right) → its back shows Inside panel 0 (left), mirrored

So the back-face index = `(panelCount - 1 - i)`.

The mirror is achieved by adding `transform: scaleX(-1)` to the back-face image in `FoldNode.tsx`, since the back face `div` already has `transform: rotateY(180deg)` — but actually that rotation already provides the mirror effect. So we just need to map to the correct reversed index.

### Concrete changes

1. **`src/components/preview/FoldPreview.tsx`** — Update `buildPanelsWithArtwork`:
   - Outside panels: `front.imageUrl = outsideSlices[i]`, `back.imageUrl = insideSlices[panelCount - 1 - i]` (or no image if single-sided)
   - Inside panels: `front.imageUrl = insideSlices[i]`, `back.imageUrl = outsideSlices[panelCount - 1 - i]`

2. **`src/components/preview/brochure/FoldNode.tsx`** — No structural changes needed. The existing `rotateY(180deg)` on the back-face div already handles the horizontal mirror. Just confirm back-face images render correctly.

This is a small, targeted fix affecting artwork assignment only — no geometry or control changes.

