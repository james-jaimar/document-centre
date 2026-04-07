

# Plan: Fix Fold Preview — Folded State Shows Blank

## Root Cause

The `FoldPreview` component uses `objectFit: "cover"` on the image. When the composed panel image's aspect ratio doesn't match the assumed 3:2 container ratio, `objectFit: cover` scales and **centers** the image content within the element box, shifting the panel positions. The `marginLeft` clipping math assumes the image fills the element width exactly — but with `cover`, it doesn't. Result: the folded view clips to the wrong region and shows blank.

## Fix

**`src/components/preview/FoldPreview.tsx`**:
1. Change `objectFit: "cover"` to `objectFit: "fill"` on both the folded and unfolded `<img>` elements. This ensures the image stretches to exactly match the container dimensions, so the fractional panel positions align correctly with the `marginLeft` clipping math.

Single-line change in two places — the folded img (line 101) and the unfolded img (line 113).

