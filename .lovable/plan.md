Plan to fix the remaining rotation and binding preview issues

1. Fix the server-side rotation operation so it actually becomes the active PDF
   - Update `pdf-server/app/tasks/operation_tasks.py` for `rotate_pdf`.
   - The current rotate job creates a `rotated_pdf` derived file, but it does not promote that output to `asset.normalized_storage_path` or refresh the asset dimensions. That means the next preview render can still read the pre-rotation PDF.
   - Change it to match the proven `resize_pdf` / `normalize_orientation` pattern:
     - upload rotated PDF under a derived/rotated path,
     - create the derived-file record,
     - inspect the rotated output,
     - update the asset with `normalized_storage_path`, `page_count`, `width_pt`, `height_pt`, and `boxes`,
     - return those refreshed values in the job result.

2. Use the stronger orientation-normalisation path for the advisory
   - Update `src/pages/dashboard/OrderFiles.tsx` so the advisory uses the backend operation that bakes rotation into page geometry for “make portrait / make landscape”, rather than relying on a simple `/Rotate` viewer hint.
   - For bound documents, call orientation normalisation with `dominant: "portrait"`; for presentations, call it with `dominant: "landscape"`.
   - Keep the existing metadata cleanup and thumbnail re-rendering, but base the final document dimensions on the inspected/promoted asset rather than just swapping the previous values blindly.

3. Make the frontend metadata and thumbnail state harder to desynchronise
   - After the rotation/normalisation job completes, fetch the refreshed asset and write `page_width_mm` / `page_height_mm` from the actual asset dimensions.
   - Clear stale signed thumbnail URLs before the new render is displayed so the preview cannot reuse old landscape thumbnail images from cache.
   - Continue clearing `orientation_mismatch` and setting `orientation_resolved: true` before thumbnail rendering, so the double-modal bug stays fixed.

4. Fix the binding artwork regression shown in the screenshot
   - The broken-image/text overlap is coming from the binding image layer being sized/positioned badly for the closed-book preview.
   - Update `src/components/preview/BindingSpine.tsx` / `FlipBook.tsx` so binding art is clipped to the page/spine area and cannot spill text or broken-image UI over the document.
   - Use the correct long-edge art for portrait pages and short-edge art only for genuine landscape/top-bound layouts.
   - Add a safe fallback style so if a binding asset ever fails to load, it degrades to a simple spine/comb strip instead of showing broken image alt text.

5. Verify the full flow after implementation
   - Upload a landscape PDF into a portrait bound-document product.
   - Confirm the advisory appears once, the operation runs once, the resulting PDF thumbnails are portrait with rotated content, and the Configure Document preview stays portrait.
   - Confirm comb/spiral/wire binding artwork no longer appears as broken image text or floats beside the page.