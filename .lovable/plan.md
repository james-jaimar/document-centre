## Goal
Reverse the tab slot order along the bottom edge so that a 90° clockwise rotation of the portrait pack lands Tab 1 on the right and Tab 10 on the left (matching the physical reality).

## Why
Portrait order: Tab 1 (top) → Tab 10 (bottom). A true 90° CW rotation maps top→right, bottom→left. Currently the bottom-edge rendering keeps Tab 1 on the left, which is the opposite of a rotated portrait pack.

## Change — `src/components/preview/FlipBook.tsx` (`TabOverlay`)

In the `bindingEdge === "top"` (bottom-edge) branch, mirror the horizontal position of each tab so slot index `i` lands at the position currently occupied by slot `bankSize - 1 - i`. Concretely, replace the current `leftOffset = i * (pageWidth / bankSize)` (or equivalent) with the mirrored offset:

```
leftOffset = (bankSize - 1 - i) * segmentWidth
```

Apply this to both the ahead/current page and the behind page rendering paths within the bottom-edge branch. No change to portrait. No change to wrapper sizing, rotation transform, label orientation, banking math, or count.

## Verification
- Landscape preview: Tab 1 appears at the right end of the bottom edge; Tab 10 at the left end. Tab 2…9 fill in between in correct order.
- Portrait preview: unchanged (Tab 1 top, Tab 10 bottom).
- Behind/ahead split still places "ahead" tabs under the right page and "behind" tabs under the left page.
