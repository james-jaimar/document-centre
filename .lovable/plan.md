

# Plan: Replace Fold Preview with CSS 3D Panel-Hinge Engine

## What's wrong today

The current `FoldPreview` renders a single flat sheet image and tries to "window" into a panel region using `background-position`. This approach:
- Doesn't actually fold anything — it just shrinks the container
- Shows blank when the clipping math doesn't align with the image
- Has no 3D depth, no animation, no staged unfolding
- Doesn't model front/back faces per panel

## What the proposal recommends

Instead of treating a brochure as a flat image you crop, model it as **physical panels connected by hinges** using CSS 3D transforms. Each panel is a `<div>` with a front face and a back face (using `backface-visibility: hidden`), and panels are **nested inside each other** so that when a parent panel rotates, its children move with it — exactly like real paper folding.

Key concepts:

```text
CURRENT (broken):
┌──────────────────────────┐
│  Single flat image       │  ← background-position crops to one panel
│  with background-clip    │     (fragile, no 3D, no animation)
└──────────────────────────┘

PROPOSED:
┌────────┐┌────────┐┌────────┐
│ Panel1 ││ Panel2 ││ Panel3 │  ← Each panel = independent div
│ front  ││ front  ││ front  │     with front + back face images
│ back   ││ back   ││ back   │
└────────┘└────────┘└────────┘
    hinge ──┘    hinge ──┘

Panel2 is NESTED inside Panel1's hinge point.
Panel3 is NESTED inside Panel2's hinge point.
When Panel2 rotates, Panel3 rotates WITH it.
```

The renderer uses `rotateY()` CSS transforms with `transform-origin: left center` on nested containers. Each fold type just defines different rotation angles per state:

- **Half-fold**: 2 panels → "closed" (panel2 rotated -180°) / "open" (0°)
- **Tri-fold C**: 3 panels → "closed" / "step1" (one flap open) / "open"
- **Tri-fold Z**: 3 panels with alternating fold directions
- **Gate-fold**: 4 panels, outer flaps fold inward from both sides

## What changes

### New files

| File | Purpose |
|------|---------|
| `src/components/preview/brochure/brochure-types.ts` | Data types: `Panel`, `Hinge`, `BrochureSpec`, `PanelTransformState` |
| `src/components/preview/brochure/brochure-specs.ts` | Pre-built specs for half-fold, tri-fold-c, tri-fold-z, gate-fold |
| `src/components/preview/brochure/BrochureViewer.tsx` | Top-level: holds state, controls, renders stage |
| `src/components/preview/brochure/BrochureStage.tsx` | Sets CSS perspective, sizes the scene |
| `src/components/preview/brochure/FoldNode.tsx` | Recursive component: one panel + its child hinge. Handles `rotateY`, `backface-visibility`, front/back face rendering, shadows |
| `src/components/preview/brochure/BrochureControls.tsx` | Step buttons (Fold / Unfold / Step) + flip sheet toggle |

### Modified files

| File | Change |
|------|--------|
| `src/components/preview/FoldPreview.tsx` | Rewrite to delegate to `BrochureViewer`, mapping existing `urls` (composed surface images) to panel face images by slicing each surface image into per-panel regions via canvas |
| `src/components/preview/previewTypes.ts` | Map existing `FoldType` values to the new spec builder |

### How panel images are sourced

The upstream `PreviewPanel.tsx` already composes per-surface images (Outside / Inside) via canvas stitching. The new `FoldPreview` will take those 1-2 composed surface URLs and slice them into per-panel images using canvas (splitting by the known panel width fractions from `FOLD_GEOMETRY`). Each panel then gets its own front/back `imageUrl`.

### Rendering approach

Each `FoldNode` is a positioned `<div>` with:
- `transform-style: preserve-3d`
- `transform-origin: left center`
- `transform: rotateY(Ndeg)` with CSS transition
- Two child divs: `.panel-front` (rotateY 0) and `.panel-back` (rotateY 180deg), both with `backface-visibility: hidden`
- A child `FoldNode` for the next panel (nested hinge)

Shadows are added dynamically based on fold angle — deeper shadow when folded, subtle when open.

### State machine

Instead of a binary "folded/unfolded" toggle, each fold type has named states that the user steps through:

- Half-fold: closed → open (2 states)
- Tri-fold: closed → step1 → open (3 states)
- Gate-fold: closed → step1 → open (3 states)

Controls show "Next step" / "Previous step" buttons plus a "Flip sheet" button for outside/inside.

## Phase 1 scope (this implementation)

- Half-fold, tri-fold C (maps to existing `tri_fold`), tri-fold Z (maps to `z_fold`), gate-fold
- Discrete state transitions with smooth CSS animation (700ms ease)
- Front/back face support with flip-sheet toggle
- Fold-edge shadows
- No drag interaction (buttons only)

