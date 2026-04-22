

## Fix the two remaining ring binder bugs

### Bug 1 — body page 1 is showing as the cover

When no cover file is uploaded, the flipbook is currently being told `showCover={true}` (because of the virtual ring cover) but no actual cover face is injected into the page array. So `react-pageflip` takes **page 0 of the body file** and renders it as the solo right-hand cover. That is exactly what the screenshot shows ("1 / 16" with the company profile artwork as the cover).

**Fix**: In `PreviewPanel.tsx`, when the product is a ring binder, inject a virtual blank cover pair at the start of the page array — same pattern as PVC, but always blank:

- `pvc_cover_front` (blank — closed-binder face)
- `pvc_cover_back` (blank — inside-front blank)

This must run only for ring binders that don't already have a real cover or PVC option. The result:

- `urls[0]` = blank cover face (rendered as the closed-binder image in `FlipBook`)
- `urls[1]` = blank inside-front
- `urls[2]` = first real body page (lands solo on the right when the binder "opens")
- counters: `1 / 16` becomes `Front Cover` then `Page 1 of 16` on opening

This is the same physical-sheet model used elsewhere — it just always injects for ring binders, and the cover face is intentionally blank when no artwork exists.

The `pageInfoText` already shows "Front Cover" for `pvc_cover_front`, so labelling is correct without further change.

### Bug 2 — open binder background is the wrong size and there's a floating overlay

The current implementation sizes the open-binder PNG based on `displayedPageHeight × aspectRatio`, which doesn't line up with the spread because the binder PNG aspect (≈2.12) is different from the A4 spread aspect (≈1.41). That makes the background appear "shrunk" relative to the pages, and the cropped ring strip floats over the seam.

**Fix**: invert the layout. The open binder background becomes the **outer frame**. The flipbook spread is sized to fit *inside* the binder's printable inner rectangle.

Steps in `FlipBook.tsx` (open-state ring branch):

1. Compute the binder artwork size to fit the available container at its true `RING_OPEN_ASPECT` (1781/840), centred.
2. Define a normalised inner printable rectangle on the binder artwork (left/top/right/bottom inset that excludes the binder cover edges and the ring mechanism column). Tune those constants once against the artwork.
3. Derive `displayedSpreadWidth` and `displayedPageHeight` from that inner rectangle (not from the available container). Recompute `scaleFactor` accordingly.
4. Position the spread absolutely over the inner rectangle.
5. Remove the cropped-strip overlay entirely. The ring mechanism is already visible because it's part of the open binder PNG behind the spread, and the spread now sits inside the printable area, not over the rings.

Tabs continue to extend outside the spread (still respected by `tabGutter`), but the binder frame gets enough padding so they don't clip the binder edge.

### About the user's offer for a PNG of just the mechanism

Yes, please. A separate transparent-background **rings PNG** would let us layer the rings *over* the page edges (so pages appear tucked under the rings) instead of relying on the rings being baked into the background. That's the cleanest physical model.

For now this plan does not depend on it — it works with the single composite open-binder PNG by treating that PNG as the outer frame and putting the spread inside the printable area. If you supply the transparent rings PNG afterwards, we can do a small follow-up that:

- uses `ring_binder_white_open.png` (with rings removed by you, or a plain blank open binder) as the background frame
- overlays the transparent rings PNG above the spread at the correct z-index
- aligns it to the centre of the spread

That would only be a 10-line change on top of this plan.

### Files to change

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | For ring binders without a real cover/PVC, inject a blank `pvc_cover_front` + `pvc_cover_back` pair so the first body page no longer slides into the cover slot |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror the same blank ring-binder cover injection so saved-order previews match live preview |
| `src/components/preview/FlipBook.tsx` | Rebuild the open-state ring layout: binder PNG becomes the outer frame; spread sized to the inner printable rectangle; remove the floating cropped ring-strip overlay |

### Result

- No-cover ring binders show: closed binder (page 0) → opens to first body page solo on the right (page 1) → continues as normal
- Open binder background is correctly sized; pages sit inside the printable area, not floating over the edge
- No more weird floating mechanism strip
- Once you send the transparent rings PNG, we can do a follow-up to layer the rings *over* the pages for the final physical look

