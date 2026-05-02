## Problem

Both `PhotoEditorModal` and `PosterImageEditor` use `react-easy-crop` with `objectFit="cover"` and a hand-rolled zoom calculation that breaks when images are rotated. The root cause: `cover` mode makes the library decide the baseline scaling internally based on the un-rotated natural image, then our zoom maths fights it after rotation.

## Solution

Extract the zoom/rotation logic into a shared hook, switch both editors to `objectFit="contain"`, and compute Fill/Fit zoom values from the actual rendered media and crop-frame sizes reported by the cropper itself.

## Plan

### 1. Create `src/hooks/useCropperZoom.ts` (shared hook)

A hook that both editors will call. It will:

- Accept: `rotation`, `fitMode` ("fill" | "fit"), `aspect` (the print frame aspect ratio)
- Track `mediaSize` (from the cropper's `onMediaLoaded` callback) and `cropSize` (from `onCropSizeChange`)
- Compute the rotation-adjusted media bounding box from `mediaSize` + `rotation`
- Calculate:
  - **fillZoom** = scale needed so the rotated image fully covers the crop frame
  - **fitZoom** = scale needed so the entire rotated image is visible inside the crop frame
- Return: `{ fillZoom, fitZoom, minZoom, onMediaLoaded, onCropSizeChange, restrictPosition }`
  - `minZoom` = `fitZoom` (always allow zooming out to see the whole image)
  - `restrictPosition` = `zoom >= fillZoom` (only clamp dragging when the image covers the frame)

The maths is straightforward:
```
rotatedW = mediaW * |cos(r)| + mediaH * |sin(r)|
rotatedH = mediaW * |sin(r)| + mediaH * |cos(r)|
fillZoom = max(cropW / rotatedW, cropH / rotatedH)
fitZoom  = min(cropW / rotatedW, cropH / rotatedH)
```
This works identically for landscape, portrait, and any rotation.

### 2. Update `PhotoEditorModal.tsx`

- Switch `objectFit` from `"cover"` to `"contain"`
- Remove the manual `naturalSize` probing `useEffect` and `computeFitZoom` function
- Use `useCropperZoom` hook instead
- Pass `onMediaLoaded` and `onCropSizeChange` to the `<Cropper>`
- Use the hook's `fillZoom`, `fitZoom`, `minZoom`, and `restrictPosition`
- On rotation change: reset crop to `{x:0, y:0}` and snap zoom to `fillZoom` or `fitZoom` based on current mode
- Fill/Fit buttons set zoom to the hook's computed values

### 3. Update `PosterImageEditor.tsx`

- Switch `objectFit` from `"cover"` to `"contain"`
- Use the same `useCropperZoom` hook
- Add Fill/Fit mode toggle buttons (matching the photo editor UX) so poster users get the same controls
- Pass `onMediaLoaded` and `onCropSizeChange` to the `<Cropper>`
- Use the hook's `minZoom` and `restrictPosition`
- On rotation change: reset crop and snap zoom

### 4. Rotation handler in both editors

When the user clicks Rotate:
1. Update rotation state
2. Reset crop to `{x: 0, y: 0}`
3. The hook recomputes `fillZoom`/`fitZoom` from the new rotation
4. A `useEffect` watching `fillZoom`/`fitZoom` + `fitMode` snaps the zoom to the correct value

This ensures a portrait image rotated 90 degrees into landscape fills the frame correctly, and vice versa.

### Files changed

| File | Action |
|------|--------|
| `src/hooks/useCropperZoom.ts` | New — shared zoom logic |
| `src/components/photo/PhotoEditorModal.tsx` | Edit — use hook, switch to contain |
| `src/components/order/PosterImageEditor.tsx` | Edit — use hook, switch to contain, add Fill/Fit |
