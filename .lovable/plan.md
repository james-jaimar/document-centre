
## Problem

In the Photo Editor Modal (`PhotoEditorModal.tsx`), when a portrait image is rotated 90 degrees, it can't zoom out below 1x to show the full image within the print frame. The `computeFitZoom` function correctly calculates a sub-1 zoom value, and `minZoom` is set correctly, but two issues prevent it from working:

1. **`objectFit="cover"` conflict**: With `objectFit="cover"`, react-easy-crop treats zoom=1 as "image covers the frame". When the rotated image's aspect is very different from the frame, the library's internal constraints fight against sub-1 zoom. The fix is to switch to `objectFit="contain"` when the user is zoomed below 1 (or when fit mode is active), which lets the image letterbox inside the frame.

2. **Auto-snap to fillZoom=1 on rotate**: The effect on line 161-167 snaps zoom back to 1 whenever `fitMode === "fill"` and rotation changes. After rotating a portrait to landscape, zoom=1 crops heavily. The rotate handler should detect the aspect mismatch and auto-switch to "fit" mode (or at least not force zoom=1 when the image can no longer fill without severe cropping).

## Changes

**File: `src/components/photo/PhotoEditorModal.tsx`**

1. **Dynamic `objectFit`**: Switch from hardcoded `objectFit="cover"` to a computed value. Use `"contain"` when `zoom < 1` or `fitMode === "fit"`, and `"cover"` otherwise. This lets react-easy-crop properly handle sub-1 zoom levels.

2. **Update `handleRotate`**: After rotating, if the new image aspect differs significantly from the frame aspect (ratio mismatch > threshold), automatically switch to "fit" mode and snap zoom to `fitZoom`. This gives the user an immediate view of their full rotated image rather than a heavily-cropped fill.

3. **Update the rotation effect** (lines 161-167): When in "fill" mode and the rotated image can't reasonably fill the frame (e.g., portrait image in landscape frame after 90-degree rotation), auto-switch to "fit" mode instead of forcing zoom=1.

4. **Ensure `restrictPosition={false}` when zoom < 1**: Already partially implemented (`restrictPosition={zoom >= 1}`), but verify this works correctly with the `objectFit` change.

These are all changes within the single file. The `computeFitZoom` function and `minZoom` calculation are already correct and don't need modification.
