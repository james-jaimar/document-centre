I’ve found the actual cause: the current zoom calculation is modelling `react-easy-crop` incorrectly.

The editor is passing a custom `cropSize` and then calculating fit/fill from a guessed “rendered image size” using the outer container dimensions. But `react-easy-crop` already computes its own `mediaSize` after the image loads, and for a `cropSize` override the correct calculation is simply:

```text
rotatedDisplayedWidth  = rotate(mediaSize.width, mediaSize.height).width
rotatedDisplayedHeight = rotate(mediaSize.width, mediaSize.height).height

Fill zoom = max(cropFrameWidth / rotatedDisplayedWidth,
                cropFrameHeight / rotatedDisplayedHeight)

Fit zoom  = min(cropFrameWidth / rotatedDisplayedWidth,
                cropFrameHeight / rotatedDisplayedHeight)
```

Right now the code recalculates the displayed image size independently from `containerWidth/containerHeight`, which diverges from what the cropper is actually rendering. That’s why the rotated image can visibly sit inside the crop frame even while the UI thinks it is already at “fit” or “fill”.

Plan:

1. Fix `useCropperZoom.ts`
   - Stop deriving zoom from a guessed container-based rendered size.
   - Use the `mediaSize.width` and `mediaSize.height` values supplied by `onMediaLoaded`, because those are the exact rendered dimensions used internally by `react-easy-crop`.
   - Apply the existing rotation bounding-box formula to those displayed dimensions.
   - Compute:
     - `fillZoom = max(cropSize.width / rotatedW, cropSize.height / rotatedH)`
     - `fitZoom = min(cropSize.width / rotatedW, cropSize.height / rotatedH)`
   - Clamp to safe finite values only.

2. Fix fit/fill state application in `PhotoEditorModal.tsx`
   - When clicking Rotate, reset crop and preserve the current mode, then let the hook snap to the correct new zoom after the rotated dimensions settle.
   - When clicking Fill or Fit, set zoom from the corrected values and reset crop to centre.
   - Ensure the snap effect also re-runs when rotation/crop frame changes, not just when rounded zoom values change.

3. Apply the same corrected behaviour to `PosterImageEditor.tsx`
   - It uses the same hook, so the core fix should carry over.
   - Align rotate/fill/fit behaviour with the photo editor so both editors behave predictably.

4. Remove any over-complicated/incorrect assumptions introduced in the previous iterations
   - Keep the stable element measurement hook because it fixed the loading issue.
   - Do not reintroduce the fragile “only render cropper after measured dimensions” gate.
   - Do not use `objectFit='cover'` as a shortcut; keep the explicit Fill/Fit buttons controlling zoom.

5. Add a small regression test for the geometry helper/hook logic if the current test setup supports it cleanly
   - Specifically test a portrait image rotated 90° into a landscape 4×6 crop frame.
   - Expected result: Fill zoom covers the entire crop frame; Fit zoom shows the entire rotated image.

This is a small targeted fix: the key change is replacing the wrong zoom input dimensions with the cropper’s actual `mediaSize` dimensions.