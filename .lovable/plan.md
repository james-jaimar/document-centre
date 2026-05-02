I agree with you: this should be simple geometry, and the current implementation is still letting `react-easy-crop` choose a crop-frame size based on the rotated image. That is why the rotated portrait image in your screenshot does not fill the actual 4×6 print frame correctly.

Plan:

1. Replace the current shared zoom hook with a frame-first model
   - The print/poster frame will be treated as the fixed target.
   - The hook will measure the editor container and calculate the crop frame from the requested print aspect ratio, independent of the image orientation.
   - Example: 4×6 landscape always uses a landscape crop frame; rotating the image must not shrink or reshape that frame.

2. Use one formula for Fill/Fit everywhere
   - Use the image’s natural dimensions, swap width/height for 90°/270° rotation, then calculate:
     - Fill: `max(frameWidth / rotatedImageWidth, frameHeight / rotatedImageHeight)`
     - Fit: `min(frameWidth / rotatedImageWidth, frameHeight / rotatedImageHeight)`
   - This will be used by both the photo print editor and the poster editor.
   - No aspect-ratio guessing, no special cases for portrait vs landscape.

3. Pass an explicit `cropSize` into `react-easy-crop`
   - This is the missing piece.
   - Right now the library is allowed to compute the crop area itself from the rotated media, so when the image rotates it can make the crop frame smaller than the print frame.
   - I will pass the calculated fixed frame size into both editors so the crop window remains the print/poster canvas.

4. Keep `objectFit="contain"`, but stop relying on its rendered media box for print geometry
   - `contain` is still useful as a stable baseline.
   - But the actual Fill/Fit zoom should come from the real target frame and the natural image dimensions, not from the library’s auto-sized rotated crop area.

5. Fix snapping and controls in both editors
   - Rotate 90° will centre the crop and snap to the active mode, usually Fill.
   - Fill will guarantee no grey/empty area inside the print frame.
   - Fit will show the whole image and may intentionally show background where aspect ratios differ.
   - The slider minimum will allow Fit, but Fill will be the default for photo prints.

6. Apply the same shared logic to:
   - `src/components/photo/PhotoEditorModal.tsx`
   - `src/components/order/PosterImageEditor.tsx`
   - `src/hooks/useCropperZoom.ts`

7. Clean up the broken previous effect logic
   - Remove the fake `prevFillRef`/snap logic that does not actually distinguish first load from rotation changes.
   - Make zoom re-snapping deterministic when media, frame, aspect, rotation, or active fit mode changes.

Expected result:

- A landscape image uploaded into a 4×6 frame fills the frame.
- A portrait image rotated into that same 4×6 frame uses the exact same fill formula and fills the frame.
- Poster image editing behaves the same way as photo print editing.
- The crop frame remains the product canvas, not whatever the rotated image happens to fit inside.