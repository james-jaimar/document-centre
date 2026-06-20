## Plan

1. **Undo the regression in bound flipbook previews**
   - Stop passing `trimCrop` into `FlipBook` for normal bound-document thumbnail rendering.
   - Keep the page aspect ratio based on the TrimBox, because that part is correct.
   - This returns the flipbook to using the already-trimmed preview JPEGs, matching the first upload-page preview.

2. **Keep trim clipping only where it belongs**
   - Leave `trimCrop` active for `LooseSheetsPreview` / inline PDF rendering, where the renderer may still be drawing the full PDF box and needs a CSS clip.
   - Do not apply a second CSS TrimBox crop to flipbook thumbnails that the backend has already rasterised to TrimBox.

3. **Tighten the guard against future double-cropping**
   - In `FlipBook.tsx`, either remove the new trim-crop image branch entirely or make it impossible to run unless a future caller explicitly marks the image as MediaBox-rasterised.
   - The current branch is the cause of “cropped too far into the page” and the visible edge line because it crops an image that is already trimmed.

4. **Verification**
   - Compare the two preview paths after the change:
     - Upload/organise lightbox still shows the TrimBox cleanly.
     - Bound flipbook spread uses the same visible artwork edge without extra crop.
   - Check the code paths that read `MediaBox` / `TrimBox` remain untouched, since the box-reading and backend preview-render logic are already deriving TrimBox previews correctly.