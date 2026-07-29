## 1. Auto-picked wrap colour must land in the colour picker

**Current behaviour (verified):** `wrapColorHex` starts `undefined`. `renderProductionCanvas` (`src/lib/canvasPrints/renderWrap.ts:94`) falls back to `sampleEdgeColour(...)` at render time, so the *preview* shows a sampled colour — but the picker in `CanvasEditorModal.tsx:485` renders `wrapColorHex ?? "#ffffff"` (white), and `handleSave` persists `wrapColorHex: undefined`, so the production PDF has no colour to fill with.

**Fix:**
- In `CanvasEditorModal`, when `faceBitmap` first becomes available and `wrapColorHex` is unset, sample the face edge (`sampleEdgeColour` against the face bitmap context) and `setWrapColorHex(sampled)`.
- Re-sample when the source image or crop changes *only while the user hasn't manually picked* — track a `colourWasManual` flag set by the picker's `onChange`.
- Remove the render-time fallback reliance: `wrapColorHex` is now always a concrete hex by the time the user sees it, so the picker, preview, and saved spec all agree.
- Same seeding applies in `CanvasTile.tsx` so tile thumbnails match.

Result: the auto-picked colour appears in the swatch, is editable, and is what the PDF engine fills with.

## 2. Colour picker sluggishness

Every colour change currently rebuilds the full `previewTransform` → composed production canvas → all six face bitmaps in `renderFaceBitmaps`.

**Fix:**
- Keep the debounce in `DebouncedColorInput` but raise it and commit on `change` (release) only, dropping the live `onInput` commit.
- Stop re-rasterising for colour: in `Canvas3DPreview`, when `wrapMode === "colour_wrap"`, paint the four side faces with a flat three.js material colour driven by `wrapColorHex` instead of regenerating strip bitmaps. Front/back bitmaps then don't depend on colour at all, so dragging the picker is a material update, not a canvas re-render.

## 3. Cropper vs 3D preview mismatch

**Confirmed cause:** the cropper's frame aspect is the *front face* (`orientedSize.frontWidthMm / frontHeightMm`), and `faceBitmap` is built straight from `croppedAreaPixels`. But for `gallery_wrap`, `renderProductionCanvas` scales the image to the **total** extent (front + 2×wrap + 2×bleed) and the visible front face is the inner rect. So the front face in the 3D preview shows *less* of the image than the crop box — the crop looks "slightly enlarged".

**Fix:**
- Drive the cropper aspect from the total extent when the wrap mode bleeds image over the edges (`gallery_wrap`), i.e. `totalWidthMm / totalHeightMm`.
- Overlay a non-interactive inset guide inside the crop frame marking the front-face boundary (wrap + bleed inset), labelled "wrapped edge — keep content inside".
- Feed the 3D preview the whole cropped region as the production source in gallery mode (rather than treating the crop as the face), so the face rect it slices out is exactly the region inside the guide.
- For `no_edge_print` and `colour_wrap` the crop box stays the front face — no guide, no change.

## Files touched
- `src/components/canvas/CanvasEditorModal.tsx` — colour seeding, cropper aspect + inset guide
- `src/components/canvas/Canvas3DPreview.tsx` — flat material for colour wrap sides
- `src/components/canvas/DebouncedColorInput.tsx` — commit on release
- `src/components/canvas/CanvasTile.tsx` — same colour seeding for tiles
- `src/lib/canvasPrints/renderWrap.ts` — expose a helper to sample from a face bitmap; keep the render fallback as a safety net

## Non-goals
No pricing, no PDF-server changes — `canvas_prints_assembly.py` already reads `wrapColorHex`; it just needed a real value.
