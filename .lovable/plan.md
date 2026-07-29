## Fixes for the Canvas Editor modal

### 1. Tab re-focus wipes edits and re-fetches the preview

**Cause (confirmed in `CanvasEditorModal.tsx`)**
- The seed effect (lines 115–133) depends on `[open, canvas, sizes, allowedWrapDepthsMm]`. `sizes` and `allowedWrapDepthsMm` are rebuilt each render by the parent, so any re-render (window focus, query refetch, parent state change) fires the effect again and resets `sizeSlug`, `orientation`, `wrapMm`, `wrapMode`, `crop`, `zoom`, `rotation`, `fitMode`, `croppedAreaPixels` back to the entry's saved values — throwing away in-modal edits.
- The image-loader effect (lines 136–142) depends on `signedUrl`. If the parent re-signs the URL on focus, a new `Image()` is constructed, `imgEl` swaps, `faceBitmap` recomputes, and the 3D preview visibly reloads.

**Fix**
- Change the seed effect to run only on the open-edge for a given canvas: key off `open` + `canvas.id` only, and skip when `!open`. Capture `sizes[0]?.slug` and `allowedWrapDepthsMm[0]` inside the effect via refs so their identity changes don't retrigger it.
- Memoise the loaded `HTMLImageElement` by the *stable* asset identity (e.g. `canvas.file_path` or the URL without query string) so a re-signed URL for the same underlying file doesn't rebuild `imgEl`. Only recreate the `Image` when the asset path actually changes.

### 2. Right-column pieces overlap

**Cause**
- The right column (line 338) mixes `flex-1` on the preview with a settings block using `style={{ maxHeight: "45%" }}` (line 354). Percentages resolve against the column, not the visible viewport, so on shorter heights the preview `min-h-[240px]` + the 45% settings block + edge-finish radios can exceed available space, and the color picker/edge-finish rows visibly overflow into the preview (visible in screenshot 1: A0 dropdown sits on top of the wall preview).

**Fix**
- Drop the `maxHeight: 45%` and `flex-1` mix. Give the right column a clean two-region layout: settings as a fixed-height (auto) block on top OR bottom with `shrink-0`, and the preview as the only `flex-1 min-h-0` region. Make the settings block scroll internally (`overflow-y-auto`) with a hard `max-h` in `rem`/`px`, not `%`.
- Ensure the preview container has `min-h-0` on every ancestor so it never pushes siblings.

### 3. Modal shrinks the cropper when the user zooms the browser out

**Cause**
- `DialogContent` uses `w-[90vw] h-[90vh]` (line 255). Browser zoom scales CSS pixels, so 90vw at 67% zoom gives a larger *content* area but every child (cropper, controls, 3D preview) is also scaled down uniformly — the cropper feels tiny and the controls look cramped.
- The real issue is that at 100% zoom the modal doesn't fit on a laptop, so the user zooms out to compensate, which then shrinks the working area.

**Fix**
- Replace `w-[90vw] h-[90vh]` with a bounded size that fits a 1280×720 laptop at 100% zoom: e.g. `w-[min(1200px,95vw)] h-[min(760px,92vh)]`. Cap max-width so ultra-wide displays don't stretch it.
- Reduce chrome: tighter header padding, remove the redundant blank spacer between the grid and the footer, and let the cropper claim the full left column height (no forced `min-h-[380px]` when the column is already shorter).
- Make the left column also `overflow-hidden` with the cropper as `flex-1 min-h-0`, so the zoom slider and Fill/Fit row stay pinned at the bottom without pushing the cropper off-screen.

### Files touched

- `src/components/canvas/CanvasEditorModal.tsx` — seed effect, image loader effect, DialogContent sizing, left+right column flex layout, remove `%` max-height, remove stray blank block.

### Out of scope

- No changes to `Canvas3DPreview`, `renderWrap`, pricing, or the parent `CanvasPrintsBuilder`.