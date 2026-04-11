

## Fix Fold Directions and Panel Layering for Tri/Z/Gate Folds

### Root Causes

**1. Wrong fold angles (3 panels have inverted outside angles)**

CSS 3D `rotateY` with a specific `transformOrigin`:
- Right hinge + positive angle = panel goes AWAY from viewer
- Right hinge + negative angle = panel comes TOWARD viewer
- Left hinge + positive angle = panel goes AWAY from viewer
- Left hinge + negative angle = panel comes TOWARD viewer

Three panels currently fold the wrong direction on outside view:

| Fold | Panel | Current | Correct | Why |
|------|-------|---------|---------|-----|
| Tri-fold | p0 (left, right hinge) | -180 (toward) | +180 (away) | Should fold away on outside |
| Z-fold | p0 (left, right hinge) | +180 (away) | -180 (toward) | Should fold toward viewer on outside |
| Gate fold | p3 (right, left hinge) | -180 (toward) | +180 (away) | Should fold away on outside |

**2. translateZ depth offset is inverted after rotation**

In FoldNode the transform is `rotateY(180deg) translateZ(-2px)`. After a 180° rotation, the local Z-axis flips, so negative translateZ actually pushes the panel TOWARD the viewer -- opposite of intent. Swapping the order to `translateZ(-2px) rotateY(180deg)` applies the depth in world space before rotation.

### Changes

**`src/components/preview/brochure/brochure-specs.ts`**
- Tri-fold p0: `outsideFoldedAngle: -180` to `180`
- Z-fold p0: `outsideFoldedAngle: 180` to `-180`
- Gate fold p3: `outsideFoldedAngle: -180` to `180`

**`src/components/preview/brochure/FoldNode.tsx`** (line 48)
- Swap transform order from `rotateY(...) translateZ(...)` to `translateZ(...) rotateY(...)` so depth offsets work correctly in world space

Inside views remain untouched (user confirmed they work).

