# Fix: Landscape tabs don't mirror when sheet is flipped

## Problem

In the landscape presentation preview the tab bank sits along the bottom edge of the spread. On the **front** of the tab sheet, Tab 1 is rightmost (next to the outer right edge). When the sheet is turned over, Tab 1 should appear **leftmost** on the new left page (outer left edge) — that's how a real physical tab works: it mirrors across the spine.

Right now it doesn't mirror. The turned tab stays in the same horizontal column, so on the back view Tab 1 ends up next to the spine instead of at the outer edge, and the visible bank reads backwards (`Tab 2 … Tab 10` left-to-right with Tab 1 cut off at the spine — see image-854).

## Cause

`src/components/preview/FlipBook.tsx`, `TabOverlay` component, bottom-edge branch:

- Right-page (`isAhead || isCurrent`) layout (lines ~259–262) computes
  `mirroredIndex = bankSize - 1 - indexInBank` so Tab 1 (indexInBank=0) lands in the rightmost slot of the right page. Correct.
- Left-page (`isBehind`, lines ~338–340) reuses the **same** `mirroredIndex`, so Tab 1 lands in the rightmost slot of the left page — adjacent to the spine — instead of the outer left edge.

## Fix

In the `isBehind && isBottomEdge` branch only, use `indexInBank` directly (no mirror) so the tab appears at the spine-mirrored position on the left page:

```ts
// behind / left page, bottom edge
const segmentWidth = pageWidth / bankSize;
const leftOffset = segmentWidth * indexInBank + (segmentWidth - alongEdgeLen) / 2;
```

This way:
- Tab 1 front: rightmost slot of right page (outer right) ✓
- Tab 1 back:  leftmost slot of left page  (outer left)  ✓ (mirrored across the spine)
- Same applies for Tab 2, Tab 3, … which all walk inward symmetrically.

No other tab logic changes. The side-edge (portrait, non-bottom) paths and the ring-binder `RingTabOverlay` already handle mirroring correctly and stay untouched.

## Files

- `src/components/preview/FlipBook.tsx` — one-line change inside the `isBehind && isBottomEdge` block (~line 339): drop the `bankSize - 1 -` from the index used to compute `leftOffset`.
