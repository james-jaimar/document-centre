
## Canvas editor + preview polish

Focused UI/UX pass on the Canvas Prints builder. No pricing or data-model changes.

### 1. Modal sizing & fit (issues 1, 5)
`src/components/canvas/CanvasEditorModal.tsx`
- Enlarge modal to a true 90vw × 90vh with a hard `max-w`/`max-h` big enough to not clip on 1080p laptops. Remove the inner `max-h-[45%]` on the settings panel so the right column uses proper flex sizing (cropper flexes, settings scroll only if needed).
- Convert the right column to `flex-col` with `min-h-0` on both children so the 3D preview gets the top ~55% and the settings the bottom ~45% naturally — no clipping of the Save/Cancel bar at 100% zoom.
- Compact the settings block: tighten `space-y-5` to `space-y-4`, reduce padding, and drop the redundant help paragraph under Edge finish (help still shown via `title` tooltip).

### 2. Flicker on resize (issue 2)
`src/components/canvas/CanvasEditorModal.tsx` + `src/hooks/useElementSize.ts` (read-only check first)
- Debounce/RAF-throttle the ResizeObserver in `useElementSize` so the cropper doesn't re-measure on every intermediate frame.
- Only recompute the auto-snap zoom effect when `containerSize` is stable for a frame (compare rounded values), and guard against `containerSize.width === 0` transients that momentarily reset the cropper.

### 3. Tile shows product picture, not upload (issue 3)
`src/components/canvas/CanvasTile.tsx` (or its caller)
- Investigate why some tiles render the product hero image instead of the composed thumbnail. Likely causes to check in order: (a) `signedUrl` is null on first render and the caller falls back to the product image, (b) the tile render throws so `thumb` stays null and a parent shows a placeholder. Add a short diagnostic log, then fix the actual fallback path (never render the product image inside a Canvas tile — show a neutral skeleton while `thumb` is loading).

### 4. Edge finish: dedupe "No edge print" vs "Face only" (issue 4)
`src/lib/canvasPrints/types.ts`
- Remove `face_only` from `WRAP_MODE_OPTIONS` (keep the type value for backwards-compat with saved specs, but treat it as an alias of `no_edge_print` in `renderWrap.ts` — already true). Rename `no_edge_print` label to "No edge print (blank sides)" for clarity.
- Migration-safe: any existing entry stored as `face_only` continues to render identically.

### 5. 3D preview must mirror the crop exactly (issue 6)
`src/components/canvas/CanvasEditorModal.tsx` + `src/lib/canvasPrints/renderWrap.ts`
- Today the preview derives pan/zoom from an approximation (`pxPerMmFace = 6`, fillZoom ratio) so what you see on the wall doesn't match the cropper's framing.
- Change: render the 3D face texture directly from `croppedAreaPixels` — draw `image` using the crop rect into a face-sized canvas, then hand that to `Canvas3DPreview` as a pre-cropped "face image" with `imageScale=1, imageX=0, imageY=0, rotation=0`. Wrap-mode strips still read from the same face bitmap, so Mirror/Blur/Gallery all match what the customer cropped.
- Result: what's inside the cropper's crop box is exactly what appears on the front face of the 3D canvas.

### Out of scope
- Pricing, cart, or DB changes.
- Any change to non-canvas product flows.

### Technical notes
- `WRAP_MODE_OPTIONS` is consumed by `CanvasEditorModal` and `CanvasTile` labels — both keep working when `face_only` is dropped from the options list because the label lookup falls back gracefully.
- The face-image approach for the 3D preview means `renderProductionCanvas` gets a pre-composed front and only needs to build the four wrap strips — a small branch in the existing function, not a rewrite.
