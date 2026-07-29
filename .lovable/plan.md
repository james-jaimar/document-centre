
## Problems

1. **Right column overlap** — In `CanvasEditorModal.tsx`, the right pane has a `flex-1` 3D preview slot with `min-h-[320px]` inside `Canvas3DPreview`, sitting above a `max-h-[300px]` scrollable settings block. In the constrained modal height (`min(760px, 92vh)`), the preview's forced minimum height overflows its `flex-1 min-h-0` parent and the R3F canvas renders on top of the settings (Canvas Size / Wrap Depth / Edge Finish), exactly as shown in the screenshot.
2. **Preview vs crop mismatch** — For a portrait image on a landscape A0 crop, the cropper letterboxes (black bars L/R). `croppedAreaPixels` then extends beyond the source image, so `faceBitmap.drawImage(...)` fills those regions with transparent → white on the 3D face. The wall preview looks tiny/framed while the crop panel shows a big image edge-to-edge with black bars.
3. **Left "zoom fit-to-height"** — Same root cause: when the source can't fill the target aspect, "Fill" ends up equal to "Fit" and leaves bars. The user reads this as broken.

## Plan (UI/presentation only — no business logic changes)

### 1. Right column: stable, non-overlapping layout
Restructure the right pane so the preview and settings each get a real height slice and never overflow.

- Right pane becomes a two-row grid: `grid-rows-[minmax(0,1fr)_auto]`, `overflow-hidden`, `h-full`.
  - Row 1: preview wrapper `min-h-0 overflow-hidden p-4 pb-2 flex flex-col`.
  - Row 2: settings wrapper `border-t p-4 space-y-3 overflow-y-auto max-h-[45%]`.
- Remove `min-h-[320px]` from `Canvas3DPreview`'s outer `div` (both branches). Replace with `w-full h-full` only. The preview must adapt to whatever height Row 1 gives it, never push its parent.
- Preview inner wrapper: `w-full h-full min-h-0` (no min-height in pixels).
- On very short viewports, the settings scroll; the preview shrinks but stays contained.

### 2. Face bitmap parity with cropper
Match what the crop box shows exactly, including any letterboxing.

- In `faceBitmap` useMemo, before `drawImage`, compute the intersection of `croppedAreaPixels` with the image's natural bounds. Draw only the intersected source rect into its correct sub-rect inside the output canvas; leave the rest as the pre-filled white background.
- Result: if the cropper shows black bars (out-of-media area), the face shows white bars in the same proportions — 1:1 with what the user framed.

### 3. Left cropper: honest "Fill" behavior
- When the source aspect can't fill the target aspect at zoom = 1 (fillZoom == fitZoom), keep current behavior but relabel visually: leave buttons as-is; the parity fix in step 2 removes the perceived mismatch.
- No changes to `useCropperZoom` logic.

### 4. Modal shell tightening (defensive)
- Keep `DialogContent` sizing as-is (`w-[min(1200px,95vw)] h-[min(760px,92vh)]`).
- Ensure grid parent is `grid-cols-1 lg:grid-cols-2 min-h-0 flex-1 overflow-hidden` (already correct).
- Left pane unchanged.

## Files to edit

- `src/components/canvas/CanvasEditorModal.tsx`
  - Restructure right pane to `grid-rows-[minmax(0,1fr)_auto]` with `max-h-[45%]` scrollable settings row.
  - Update `faceBitmap` useMemo to clip `croppedAreaPixels` to image bounds before drawing.
- `src/components/canvas/Canvas3DPreview.tsx`
  - Remove `min-h-[320px]` from both outer wrappers; use `w-full h-full` only so the preview never forces its parent taller than the row grants.

## Out of scope

- Pricing, wrap-mode rendering math in `renderWrap.ts`, S3/CORS plumbing, cropper zoom math.

## Verification

- Load the Canvas editor at 100% zoom on a 1280×720 laptop viewport: preview and settings must be fully visible and non-overlapping; settings scroll on very short heights.
- Upload a portrait image, pick A0 landscape: crop panel and 3D face show matching framing (white bars where crop had black bars).
- Resize the browser between narrow and wide: no overlap at any width.
