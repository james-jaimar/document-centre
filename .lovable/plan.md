
## Root Cause

The previous fix tried to switch `objectFit` dynamically based on zoom level (`zoom < 1 ? "contain" : "cover"`), which creates a semantic conflict. With `"cover"`, zoom=1 means "image covers the frame." With `"contain"`, zoom=1 means "entire image is visible." The `computeFitZoom` function was designed for "cover" semantics, so its output is meaningless under "contain" -- that's why the user sees zoom go to 0.93 but the image is still "way too big."

## Correct Approach

Tie `objectFit` to `fitMode`, not to zoom level:

- **Fill mode**: `objectFit="cover"`, zoom=1 = image covers frame (excess cropped)
- **Fit mode**: `objectFit="contain"`, zoom=1 = entire image visible (letterboxed in frame)

This way each mode has clean, consistent zoom semantics.

## Changes (single file: `src/components/photo/PhotoEditorModal.tsx`)

1. **Replace dynamic objectFit logic**: Change `objectFit={zoom < 1 ? "contain" : "cover"}` to `objectFit={fitMode === "fit" ? "contain" : "cover"}`.

2. **Fix zoom/minZoom per mode**:
   - In "contain" mode: minZoom = 1 (zoom=1 already shows full image), no need for sub-1 zoom.
   - In "cover" mode: minZoom = `coverFitZoom` (same as current `computeFitZoom` result), allows zooming out to see the full image.

3. **Fix handleFit**: Set zoom to 1 (not `fitZoom`), because with `objectFit="contain"` zoom=1 already fits.

4. **Fix handleFill**: Set zoom to 1 (unchanged), because with `objectFit="cover"` zoom=1 fills.

5. **Fix rotation effect**: When rotating and in "fill" mode, if the aspect mismatch is significant, auto-switch to "fit" mode and set zoom=1 (with contain semantics). Otherwise stay in fill at zoom=1.

6. **Fix restrictPosition**: Use `fitMode !== "fit"` instead of `zoom >= 1`. In fit/contain mode, the image should be freely positionable. In fill/cover mode, restrict to prevent gaps.

7. **Fix Slider min**: Use the mode-appropriate minZoom (1 for contain, coverFitZoom for cover).
