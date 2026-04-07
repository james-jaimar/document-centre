

# Plan: Fix Fold Preview — Folded State Renders Blank

## Root Cause

The current folding technique uses `marginLeft: -(coverLeftFraction * unfoldedW)` on an `<img>` with `width: unfoldedW` inside a container with `overflow: hidden` and `width: foldedW`. This relies on the browser rendering the image wider than its container — which is fragile. The image can get clipped or collapsed before the negative margin takes effect, resulting in the visible panel showing blank.

## Fix

Replace the `marginLeft` clipping model with a **CSS `background-image` approach** for the folded state. A `<div>` with `background-image`, `background-size`, and `background-position` is a reliable way to "window" into a specific region of an image without needing the element to exceed its container.

### `src/components/preview/FoldPreview.tsx`

**Folded state** — replace the `<img>` with a styled `<div>`:
```tsx
<div
  style={{
    width: "100%",
    height: "100%",
    backgroundImage: `url(${sheetUrl})`,
    backgroundSize: `${unfoldedW}px ${containerH}px`,
    backgroundPosition: `${-(coverLeftFraction * unfoldedW)}px 0`,
    backgroundRepeat: "no-repeat",
  }}
/>
```

This renders the full sheet image at `unfoldedW × containerH` as a background, then positions it so only the cover panel is visible within the `foldedW × foldedH` container. The container's `overflow: hidden` is no longer needed for this to work — `background-image` naturally clips to the element bounds.

**Unfolded state** — keep as-is (the `<img>` with `objectFit: "fill"` works fine when the image fills its container 1:1).

### Single file change
| File | Change |
|------|--------|
| `src/components/preview/FoldPreview.tsx` | Replace folded-state `<img>` with a `background-image` div |

