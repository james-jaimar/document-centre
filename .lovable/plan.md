Plan to fix canvas prints by copying the working photo prints image-loading pattern:

1. **Stop mutating image URLs in canvas**
   - Remove the `?cors=1` cache-buster from `CanvasEditorModal` and `CanvasTile`.
   - Keep `blob:` URLs exactly as returned by `photoBlobCache`; appending query params to a `blob:` URL creates a different, non-existent resource and matches the `ERR_FILE_NOT_FOUND` screenshot.

2. **Use the same source priority as photo prints**
   - Continue resolving images as: cached local `blob:` URL first, then signed S3 URL fallback.
   - Keep canvas editor using the preview derivative first, original fallback second, same as photo prints.

3. **Apply CORS only where it is valid**
   - For real remote URLs (`http:` / `https:`), keep `crossOrigin="anonymous"` before loading into canvas.
   - For `blob:` / `data:` URLs, load as-is without cache-busting or unnecessary CORS attributes.

4. **Make tile rendering follow the photo tile pattern**
   - Add a stable render cache key to `CanvasTile` so tiles do not flicker or re-render unnecessarily when signed URLs rotate.
   - Ensure failed tile renders surface a fallback icon instead of poisoning the editor flow.

5. **Verify in browser**
   - Open the canvas prints page, upload/edit a canvas, confirm:
     - cropper shows the customer-uploaded image,
     - 3D preview loads,
     - no `ERR_FILE_NOT_FOUND`,
     - no S3 CORS canvas draw error.

Technical detail: the confirmed divergence is that photo prints pass the resolved URL directly into `Cropper`/`renderPhotoPreview`, while canvas currently creates `corsSafeUrl = signedUrl + '?cors=1'`. Because canvas often receives `blob:` URLs from the same photo blob cache, that mutation breaks local cached images.