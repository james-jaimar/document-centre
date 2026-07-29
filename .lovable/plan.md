## Fix S3 CORS block on canvas preview

The S3 bucket CORS rule already lists every relevant origin, so the config is not the problem. The failure is on our side: the image loader that feeds the cropper / 3D face-bitmap does not opt into CORS, so S3 returns the object without CORS headers, the browser caches that response, and every subsequent attempt to draw it into a canvas is rejected as a tainted / CORS-blocked read.

### Changes

1. **`src/components/canvas/CanvasEditorModal.tsx`** (and any sibling that instantiates `new Image()` for the canvas pipeline)
   - Set `img.crossOrigin = "anonymous"` **before** assigning `img.src`.
   - Append a stable cache-buster query param (e.g. `?cors=1`) the first time we load the signed URL for canvas use, so the browser can't reuse a previously cached no-CORS response.

2. **`src/lib/canvasPrints/renderWrap.ts`**
   - Where an `HTMLImageElement` is created internally, apply the same `crossOrigin = "anonymous"` before `src`.

3. **`src/components/canvas/CanvasTile.tsx`**
   - If the tile renders the composed thumbnail through an `<img>` that later feeds a canvas, add `crossOrigin="anonymous"` on the JSX element.

4. **Signed URL side (verify only, no change expected)**
   - Confirm the signer does not add `response-content-disposition` differences between the initial `<img>` load and the canvas load, since divergent query strings otherwise re-request without CORS headers.

### Why this fixes it

With `crossOrigin="anonymous"` the browser sends `Origin: https://document-centre.com`, S3 matches the existing rule, returns `Access-Control-Allow-Origin`, and the response is stored in a **separate CORS-tainted cache slot** — so canvas draws succeed and subsequent loads stay valid.

### Out of scope

- No changes to the S3 bucket CORS JSON (already correct).
- No changes to the signed-URL edge function auth.
