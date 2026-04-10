

## Problem

The current 3-panel preview is broken because of a flawed rendering architecture:

1. **Recursive nesting model** -- panels are nested inside each other's DOM (parent-child), so the left panel has no real width and overlaps the center panel. This is why only ~2/3 of the sheet is visible.
2. **Sequential state stepping** -- the controls step through a fixed sequence ("Open" → "Right Flap In" → "Closed"), but the user wants independent left/right fold buttons.
3. **No separation between tri-fold (roll/C-fold) and Z-fold** -- they need distinct fold physics.

## Architecture change: flat sibling layout

Replace the recursive hinge tree with a flat layout where all panels are **absolutely positioned siblings** inside the stage. Each panel knows its own hinge edge (transform-origin) and rotation. No nesting.

```text
┌─────────────┬─────────────┬─────────────┐
│  Panel 0    │  Panel 1    │  Panel 2    │
│  (left)     │  (center)   │  (right)    │
│             │  FIXED ROOT │             │
│ hinge:right │             │ hinge:left  │
└─────────────┴─────────────┴─────────────┘
   origin:     stays put      origin:
   right edge                 left edge
```

- **C-fold/roll-fold (tri_fold):** right panel folds inward (-180°), left panel folds inward (+180°) over the top
- **Z-fold:** right panel folds inward (-180°), left panel folds outward (-180°) behind
- Each panel's `left` is computed from the sum of preceding panel widths
- Each panel's `transform-origin` is set to its hinge edge

## Controls: independent left/right

Replace the sequential prev/next stepper with two toggle buttons:

```text
[Fold Left ↻] [Fold Right ↻] [Show Inside]
```

- "Fold Left" toggles the left panel between 0° and its folded angle
- "Fold Right" toggles the right panel between 0° and its folded angle
- Both can be folded independently
- "Show Inside" flips the scene 180° and swaps artwork

## Panel widths

All 3-panel folds use equal thirds (0.333 each).

## Fold types

- **tri_fold** = roll-fold / C-fold: both panels fold inward (same direction)
- **z_fold** = Z-fold: panels fold in opposite directions (accordion style)

These remain as separate `FoldType` values. The user confirmed they are distinct products.

## Gate fold (4 panels)

Same flat-sibling model with 4 panels. Left and right gates get independent fold buttons. Center two panels stay fixed.

## Files to change

1. **`brochure-specs.ts`** -- Remove `outsideStates`/`insideStates` arrays. Replace with a `foldAngles` config per panel (folded angle for outside, folded angle for inside). Equal-third widths.

2. **`brochure-types.ts`** -- Replace `FoldState[]` with per-panel fold config: `{ panelId, foldedAngle, hingeEdge }`. Add a new `FoldConfig` type.

3. **`BrochureStage.tsx`** -- Complete rewrite. Flat layout: loop over panels, position each with `left = sum of preceding widths`, set `transformOrigin` to hinge edge, apply rotation from component state. No recursive tree.

4. **`FoldNode.tsx`** -- Simplify to a single panel renderer (no leftChild/rightChild). Just renders front face, back face, and fold shadow.

5. **`BrochureControls.tsx`** -- Replace prev/next stepper with independent fold toggle buttons per foldable panel, plus the existing surface toggle.

6. **`BrochureViewer.tsx`** -- Manage per-panel fold state (open/closed boolean per panel) instead of a single state index. Pass rotation values to stage.

7. **`FoldPreview.tsx`** -- No major changes needed; it already slices artwork correctly.

8. **`previewTypes.ts`** -- Update `FOLD_GEOMETRY` to use equal thirds for tri_fold and z_fold.

## Implementation order

1. Update types and specs (brochure-types.ts, brochure-specs.ts, previewTypes.ts)
2. Rewrite BrochureStage with flat sibling layout
3. Simplify FoldNode (remove child nesting)
4. Rewrite BrochureControls with independent fold buttons
5. Update BrochureViewer state management
6. Verify bi-fold still works (2 panels, single fold button)

