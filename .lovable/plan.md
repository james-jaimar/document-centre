

## Problem

The fold angles in `brochure-specs.ts` are incorrect for C-fold and Z-fold, causing panels to fold in the wrong direction.

Using CSS 3D transform conventions:
- `rotateY(+180)` on a **left-hinged** panel swings the right edge AWAY (behind the screen)
- `rotateY(-180)` on a **left-hinged** panel swings the right edge TOWARD the viewer
- `rotateY(+180)` on a **right-hinged** panel swings the left edge TOWARD the viewer
- `rotateY(-180)` on a **right-hinged** panel swings the left edge AWAY (behind)

### Physical fold behavior per type

**C-fold (Roll fold) from outside:** Right panel folds BEHIND center (away), then left panel folds BEHIND on top (away). Both go behind.  
**C-fold from inside (scene flipped):** Both panels fold TOWARD viewer (inward to centre).

**Z-fold from outside:** Right panel folds BEHIND (away), left panel folds TOWARD (forward). Accordion zigzag.  
**Z-fold from inside:** Right panel folds AWAY, left panel folds TOWARD.

**Gate fold and Half fold:** Already correct.

### Current vs corrected angles

| Fold | Panel | Hinge | outside (current→fix) | inside (current→fix) |
|------|-------|-------|----------------------|---------------------|
| C-fold | p0 | right | +180 → **-180** | +180 → **+180** (same) |
| C-fold | p2 | left | -180 → **+180** | -180 → **-180** (same) |
| Z-fold | p0 | right | -180 → **+180** | -180 → **-180** (same) |
| Z-fold | p2 | left | -180 → **+180** | -180 → **-180** (same) |

## Fix

**One file: `src/components/preview/brochure/brochure-specs.ts`**

Update `buildTriFoldCSpec()`:
- p0: `outsideFoldedAngle: -180`, `insideFoldedAngle: +180`
- p2: `outsideFoldedAngle: +180`, `insideFoldedAngle: -180`

Update `buildTriFoldZSpec()`:
- p0: `outsideFoldedAngle: +180`, `insideFoldedAngle: -180`
- p2: `outsideFoldedAngle: +180`, `insideFoldedAngle: -180`

No changes to half fold, gate fold, FoldNode, BrochureViewer, or BrochureStage.

