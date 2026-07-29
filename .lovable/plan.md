# Canvas Editor Modal Layout Refinement

## Goal
Rebalance the Canvas editor modal so the cropper takes less horizontal space and the 3D preview + settings on the right get the majority of the room, while keeping the key controls visible without scrolling.

## What we will change

### 1. Modal width
- Keep the existing `90vw` width (already close to the requested 90 %).
- No change needed here; the perceived narrowness comes from the 50/50 internal split, not the modal itself.

### 2. Main split: 35 % cropper / 65 % settings
- In `src/components/canvas/CanvasEditorModal.tsx`, change the inner two-column grid from `lg:grid-cols-2` to a custom split:
  - Left column: `lg:w-[35%]` / `lg:max-w-[35%]` / `lg:flex-[0_0_35%]`
  - Right column: `lg:w-[65%]` / `lg:max-w-[65%]` / `lg:flex-[0_0_65%]`
- This gives the customer a still-large cropper while freeing up room for the preview.

### 3. Right-column vertical split: 75 % preview / 25 % settings
- Convert the right column from `flex` with `h-1/2` preview into a CSS grid:
  - `grid-rows-[75%_25%]` on large screens
  - Preview row: `min-h-0`, fills the 75 % cell
  - Settings row: `min-h-0`, fills the 25 % cell, remains `overflow-y-auto`
- The settings row will show the top controls (Canvas size, Orientation) plus a partial second control, making the scrollbar clearly visible.

### 4. Preview component sizing
- Verify `Canvas3DPreview.tsx` has no remaining `min-h-*` or fixed-height wrappers that would fight the new 75 % row.
- Ensure the `<Canvas>` container uses `w-full h-full` so it expands with the larger area.

### 5. Responsive safety
- Keep the single-column stack on small screens (`grid-cols-1` below `lg`).
- On `lg` and up, apply the 35/65 horizontal split and the 75/25 vertical split.
- Add `min-w-0` / `min-h-0` everywhere to prevent flex/grid blowouts.

## Files to edit
- `src/components/canvas/CanvasEditorModal.tsx` — layout grid and right-column split.
- `src/components/canvas/Canvas3DPreview.tsx` — confirm/adjust height-filling behaviour.

## Out of scope
- No functional changes to crop math, wrap modes, pricing, or save logic.
- No changes to the dialog header/footer.

## Verification
- Open the Canvas editor on a 720p/1080p laptop at 100 % zoom.
- Confirm the modal fills ~90 % of viewport width and height.
- Confirm left cropper is ~35 % and right panel ~65 %.
- Confirm the 3D preview occupies the top ~75 % of the right panel and the settings the bottom ~25 %.
- Confirm Canvas size + Orientation are visible without scrolling and a scrollbar hint is present for the rest.