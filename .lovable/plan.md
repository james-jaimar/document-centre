## Changes to Canvas editor

### 1. Modal sizing — true 90 × 90
`src/components/canvas/CanvasEditorModal.tsx`
- `DialogContent`: change `w-[min(1200px,95vw)] h-[min(760px,92vh)]` → `w-[90vw] h-[90vh] max-w-none`.

### 2. Right pane: preview ~50% of pane, settings scroll below
`src/components/canvas/CanvasEditorModal.tsx`
- Right column becomes `flex flex-col overflow-hidden h-full`.
- Preview wrapper: fixed `h-1/2 shrink-0` (roughly half the pane's height after the modal header). Inside, keep the "How it will look on the wall" label plus `Canvas3DPreview` filling the rest with `w-full h-full min-h-0`.
- Settings wrapper: `flex-1 min-h-0 overflow-y-auto border-t p-4 space-y-3`. Remove the `max-h-[300px]` cap. This guarantees the top row (Canvas Size / Orientation) is visible without scrolling, and everything else scrolls naturally.

### 3. Gallery wrap actually wraps the crop around the sides
`src/lib/canvasPrints/renderWrap.ts`
- Root cause: the `source` canvas draws the image sized to the **front face only** (`baseFrontW/H` derived from `frontWpx/frontHpx`), then `gallery_wrap` just copies `source` verbatim — so there is nothing to show in the wrap strips.
- Fix: in `renderProductionCanvas`, when `wrapMode === "gallery_wrap"`, size the drawn image against the **total** canvas extent instead of the front face:
  - Compute `baseTotalW/H` from `totalWpx/totalHpx` using the same aspect logic.
  - `drawW/H = baseTotalW/H * imageScale`.
  - Center on `(totalWpx/2 + imageX, totalHpx/2 + imageY)` so pan/zoom still track the same visual point on the face.
- All other wrap modes keep the current front-face sizing (face renders identically to the cropper; strips are filled by mirror/blur/colour as today).
- Result: with gallery wrap on, the crop content bleeds past the face into all four wrap strips; toggling to "No edge print" leaves white sides as before.

### Out of scope
- Cropper math, pricing, 3D lighting, colour picker.

### Verification
- Modal fills 90% × 90% of viewport at 100% zoom.
- Canvas Size / Orientation row visible without scrolling; scrolling reveals Wrap Depth and Edge Finish.
- 3D preview occupies roughly half the right pane height and is clearly larger than before.
- Switch Edge Finish through all five options; Gallery wrap now shows crop content continuing onto the sides.
