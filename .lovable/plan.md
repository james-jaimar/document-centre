I found the likely cause: the photo editor is now switching `react-easy-crop` between `objectFit="contain"` and `objectFit="cover"`. That changes the cropper’s internal media sizing. So the displayed zoom number and the visual scale are using different baselines, which matches your screenshots: it looks correct while “contained”, then jumps huge as soon as the zoom crosses back into “cover” behaviour.

Plan:

1. Restore the stable photo editor model
   - Keep the photo editor cropper on `objectFit="cover"` permanently.
   - Use sub-1 zoom values for “Fit”, calculated from the rotated image aspect vs the print-frame aspect.
   - Keep `Fill` as `zoom = 1`.
   - This matches the older working version’s semantics and avoids the `contain`/`cover` baseline jump.

2. Fix rotated portrait-to-landscape fitting
   - Recompute `fitZoom` after every 90° rotation using the rotation-adjusted image dimensions.
   - When `Fit` is active, set zoom to the recalculated `fitZoom` after rotation.
   - Keep crop centred at `{ x: 0, y: 0 }` when rotating or switching fit/fill.

3. Prevent the UI jump/stale cropper state
   - Add a stable remount key for the cropper when rotation/mode/source changes if needed, so `react-easy-crop` does not keep stale internal media sizing from the previous mode.
   - Use `restrictPosition={zoom >= 1}` so sub-1 “Fit” can show the full image letterboxed, while normal fill/crop remains constrained.

4. Make the zoom slider honest
   - Slider minimum becomes the computed `fitZoom`.
   - Slider label remains the actual cropper zoom value.
   - Touching the slider should no longer flip the underlying object-fit mode or suddenly enlarge the image.

5. Check poster editor isolation
   - Leave `PosterImageEditor` unchanged unless it shows the same issue; it currently uses fixed `objectFit="cover"` and is not sharing code directly with the photo editor.

Files to change:
- `src/components/photo/PhotoEditorModal.tsx`

Expected result:
- Initial open uses sane fill/fit state from the photo.
- Pressing `Fit` on a portrait image in a landscape 4×6 frame zooms out enough to show the whole image.
- Rotating 90° recalculates the fit correctly.
- Nudging the zoom slider no longer causes the crop area/image to jump and fill the entire modal.