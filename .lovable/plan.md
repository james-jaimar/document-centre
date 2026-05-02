I’m sorry. You’re right to be angry: the photo editor should not have ended up stuck on “Loading photo…” from a simple rotation/fill change.

What I can see from the current code is that the editor is still gated behind `signedUrl && containerDims.w > 0`, and the screenshot proves it has opened with a file name and controls but the cropper is never mounting. That means the failure is happening before `react-easy-crop` even gets a chance to load the image. The most likely regression is the new measurement/render gate, not the rotation formula itself.

Plan:

1. Remove the fragile “container measured before render” dependency
   - Keep the cropper mounted as soon as an image URL exists.
   - Stop using `containerDims.w > 0` as a hard gate that can leave the UI permanently on “Loading photo…”.
   - Give the shared hook safe default container dimensions until the real measurement arrives.

2. Replace the current retry-style `ResizeObserver` attach logic with a stable shared measuring hook
   - Measure after the modal is open using `requestAnimationFrame`.
   - Store and cancel the animation frame properly on cleanup.
   - Disconnect the observer reliably.
   - Reuse the same measurement helper in both `PhotoEditorModal` and `PosterImageEditor`.

3. Fix the cropper zoom hook so it is safe during initial render
   - Never calculate zoom from zero/invalid dimensions.
   - Clamp crop frame size to the actual editor area once available.
   - Keep the fill/fit formulas based on rendered image bounds, including 90°/270° rotation.
   - Ensure the hook always returns a valid `cropSize`, `minZoom`, `fillZoom`, and `fitZoom`.

4. Make the cropper remount when geometry-defining inputs change
   - Add a stable `key` based on image URL, target aspect, and rotation where necessary so `react-easy-crop` cannot keep stale internal sizing.
   - Keep user crop/zoom state intact except when clicking Rotate / Fill / Fit / Reset.

5. Apply the same fix to both editors
   - `PhotoEditorModal.tsx`
   - `PosterImageEditor.tsx`
   - Shared hook/helper files only; no separate duplicated photo/poster maths.

6. Reduce irrelevant console noise on these editor flows
   - Disable or suppress the third-party Tawk widget on the photo/order editor pages if its cookie errors keep masking the real console output.

7. Verification after implementation
   - Open a photo print editor and confirm it no longer gets stuck on “Loading photo…”.
   - Confirm a normal landscape photo fills a landscape frame.
   - Confirm a portrait photo rotated 90° fills a landscape frame using the same fill logic.
   - Confirm the poster editor still opens and rotates/fills using the same shared logic.

Files expected to change:
- `src/hooks/useCropperZoom.ts`
- likely a new small shared measuring hook, e.g. `src/hooks/useElementSize.ts`
- `src/components/photo/PhotoEditorModal.tsx`
- `src/components/order/PosterImageEditor.tsx`
- possibly the chat widget/layout file if needed for editor-page console cleanup