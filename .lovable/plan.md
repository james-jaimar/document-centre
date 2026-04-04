

# Plan: Fix Fold Preview — Proper Folded State Behavior

## What's wrong

Two issues:

### 1. Folded state shows all panels side-by-side instead of the folded result
When clicking "Fold", the current code applies CSS 3D rotateY transforms to panels but keeps them at their original positions. The container stays full-width. Result: panels appear side-by-side with some rotated (invisible due to `backfaceVisibility: hidden`). 

**Expected**: Folded bi-fold shows ONE HALF of the sheet (the front panel). Folded tri-fold shows ONE THIRD. The container should shrink to the folded size, showing only what you'd physically see — the outermost panel face.

### 2. Changing to tri-fold does nothing
The fold type dropdown updates `productType` via `SLUG_TO_PREVIEW` mapping. This part works (confirmed: `tri_fold` maps correctly). But `FoldPreview` renders identically regardless because the folded state just rotates panels — no visual distinction between fold types since hidden panels all disappear the same way.

## Solution: Replace CSS 3D folding with a simple folded-state model

The CSS 3D perspective approach is fundamentally wrong for this use case. Physical folding doesn't work like CSS rotateY — panels stack on top of each other and only the outermost face is visible.

### New folded behavior

**Folded state** = show a single panel-sized view of the outermost visible face, clipped from the full sheet image. The container shrinks to panel width.

| Fold Type | Folded Width | Visible Panel |
|-----------|-------------|---------------|
| Bi-fold   | 50% of sheet | Right half (panel 1) — this is the "front cover" of the folded brochure |
| Tri-fold  | ~31% of sheet | Right panel (panel 2) — the flap that faces outward |
| Z-fold    | ~33% of sheet | Right panel (panel 2) |
| Gate-fold | ~28% of sheet | Center panels visible, gates closed over them — show center |

**Unfolded state** = unchanged (full sheet with dashed fold guides).

### File changes

**`src/components/preview/FoldPreview.tsx`** — Complete rework of folded state:
- Remove all `getFoldTransform` / CSS 3D logic
- Folded state: resize container to single-panel width, clip the visible panel from the sheet image using `object-fit: none` + `object-position`
- Add smooth width transition between folded/unfolded states
- Each fold type defines which panel index is the "cover" panel when folded
- No rounded corners (already enforced, just verify)

### Folded panel clipping approach

Instead of rendering N panel divs with transforms, render ONE image element sized to the panel dimensions, using CSS `object-fit: none` and `object-position` to show only the correct slice of the full sheet:

```text
Unfolded (bi-fold):
┌──────────┬──────────┐
│ Panel 0  │ Panel 1  │  ← full sheet image, dashed fold line
└──────────┴──────────┘
  containerW = full width

Folded (bi-fold):
     ┌──────────┐
     │ Panel 1  │  ← same image, clipped to right half
     └──────────┘
  containerW = half width
```

For tri-fold folded:
```text
     ┌───────┐
     │Panel 2│  ← rightmost panel (~31% width)
     └───────┘
```

No animation of panels folding in 3D — just a clean transition between full sheet and folded result.

