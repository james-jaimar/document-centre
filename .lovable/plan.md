

## Fix roll-fold (tri-fold C) — final correct mapping

### The physics (now fully clarified)

Paper has two sides. Inside faces back outside faces:
- **p0**: front = face 0, back = face 5
- **p1**: front = face 1, back = face 4
- **p2**: front = face 2, back = face 3

When you fold a panel **toward the viewer** on the inside view, the panel rotates around its hinge — the side that was facing away from you (the **outside/front face**) now faces you.

**Inside fold sequence (user spec):**
1. Fold face 5 first toward viewer → that's **p0** (face 5 is on p0's back). After folding, p0's *front* (face 0) now faces the viewer.
2. Fold face 3 second toward viewer → that's **p2** (face 3 is on p2's back). After folding, p2's *front* (face 2) now faces the viewer, sitting on top of face 0.

**Final visible top face = face 2** ✓ (matches user's earlier "Face 2" answer).

**Outside fold sequence (already correct in user spec):**
1. Fold face 0 first away → **p0** rotates back, p0.back (face 5) now faces away from viewer (hidden behind sheet).
2. Fold face 2 second away → **p2** rotates back, sitting further behind p0.
3. Final visible = face 1 (p1.front, centre, never moves).

### Spec changes

**`src/components/preview/brochure/brochure-types.ts`**

Replace single `foldSequence` with split fields:
```ts
outsideFoldSequence: number;
insideFoldSequence: number;
```

**`src/components/preview/brochure/brochure-specs.ts` — `buildTriFoldCSpec`**

```ts
{ panelId: "p0", hingeEdge: "right",
  outsideFoldedAngle: -180, insideFoldedAngle: -180,
  outsideLayer: "behind", insideLayer: "front",
  outsideFoldSequence: 1,  // folds first on outside (away)
  insideFoldSequence: 1,   // folds first on inside (toward viewer, face 5→shows face 0)
  label: "Left" }

{ panelId: "p2", hingeEdge: "left",
  outsideFoldedAngle: 180, insideFoldedAngle: 180,
  outsideLayer: "behind", insideLayer: "front",
  outsideFoldSequence: 2,  // folds second on outside, behind p0
  insideFoldSequence: 2,   // folds second on inside, on top of p0 (face 3→shows face 2)
  label: "Right" }
```

Update `buildHalfFoldSpec`, `buildTriFoldZSpec`, `buildGateFoldSpec` to set both `outsideFoldSequence` and `insideFoldSequence` (mirror existing `foldSequence` value for both).

**`src/components/preview/brochure/BrochureStage.tsx`**

In `renderInfos` and `sorted` comparator, pick the surface-appropriate sequence:
```ts
const seq = surface === "inside" ? fc.insideFoldSequence : fc.outsideFoldSequence;
const depthOffset = layerNum * seq * DEPTH_STEP;
// sort by same `seq` so last-folded sits on top in the active surface's stack
```

**`src/components/preview/brochure/BrochureViewer.tsx` — closed static view**

When fully folded, the visible top face differs by surface:

| Surface | Top of closed bundle | Bottom of closed bundle (when flipped) |
|---|---|---|
| Outside | face 1 (p1.front) | face 0 (p0.front) |
| Inside  | face 2 (p2.front) | face 5 (p0.back) |

Replace the hard-coded face selection (~lines 142–199) with surface-aware logic:
```ts
const isOutside = surface === "outside";
const frontFace = isOutside ? p1.front : p2.front; // face 1 or face 2
const backFace  = isOutside ? p0.front : p0.back;  // face 0 or face 5
```

### Files changed

| File | Change |
|---|---|
| `src/components/preview/brochure/brochure-types.ts` | Replace `foldSequence` with `outsideFoldSequence` + `insideFoldSequence` |
| `src/components/preview/brochure/brochure-specs.ts` | Tri-fold C inside sequences corrected; update half/Z/gate to set both fields |
| `src/components/preview/brochure/BrochureStage.tsx` | Pick sequence by surface for depth and sort |
| `src/components/preview/brochure/BrochureViewer.tsx` | Surface-aware closed view (outside: face 1 / face 0; inside: face 2 / face 5) |

### Result

- **Outside**: Fold Left (face 0 away) → Fold Right (face 2 away, behind p0). Closed shows face 1; flip = face 0.
- **Inside**: switch to inside → Fold Left (face 5 toward viewer, revealing face 0) → Fold Right (face 3 toward viewer, revealing face 2 on top of face 0). Closed shows **face 2**; flip = face 5.
- Half-fold, Z-fold, gate-fold behaviour unchanged.

