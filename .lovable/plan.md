## Goal

Make the Canvas Print editor usable on phones. Today the modal is a three-column grid inside a fixed `90vh` box with `overflow-hidden`. On mobile the grid collapses to one column, but the container still doesn't scroll as a whole, so the cropper section is pushed off the top and the Save/Cancel bar is hard to reach.

## What changes (single file: `src/components/canvas/CanvasEditorModal.tsx`)

Verified current state: line 344 `DialogContent` is `w-[90vw] h-[90vh] overflow-hidden flex flex-col`; line 355 the body is `grid grid-cols-1 lg:grid-cols-[35%_25%_1fr] min-h-0 flex-1 overflow-hidden`. The three children each set their own `overflow-hidden` / `overflow-y-auto`, which only works in the desktop 3-column case.

### 1. Dialog shell
- Mobile: near-full-screen sheet — `w-[calc(100vw-0.5rem)] max-w-none h-[100dvh] max-h-[100dvh] rounded-none`; desktop keeps the existing `90vw / 90vh` behaviour via `sm:`/`lg:` variants.
- Tighter header padding on mobile (`px-4 pt-4 pb-2`), description wraps instead of truncating.

### 2. Body becomes one scroll container on mobile
- Body: `flex flex-col overflow-y-auto` on mobile, switching to the existing `lg:grid lg:grid-cols-[35%_25%_1fr] lg:overflow-hidden` at `lg`.
- Each column drops its own scrolling on mobile (`overflow-visible lg:overflow-hidden` / `lg:overflow-y-auto`) so there is exactly one scrollbar.

### 3. Section ordering and sizing on mobile
Order top → bottom, as agreed (customer scrolls):
1. **Crop your image** — cropper box gets a fixed mobile height (`h-[46vh] min-h-[260px]`, `lg:flex-1`) so the frame always fits on screen; zoom slider and Rotate/Fill/Fit/Reset buttons below it, wrapping.
2. **Preview** — the 3D preview moves directly under the cropper on mobile (`order-2 lg:order-none`) with a fixed `h-[38vh] min-h-[220px]` so customers see the effect of their crop without scrolling to the bottom; stays in the right column on desktop.
3. **Settings** — size, orientation, wrap depth, edge finish + colour picker, low-DPI warning; full width, larger tap targets (option buttons/radio rows `min-h-11`).
- Each mobile section gets a small uppercase heading so the scroll makes sense; headings hidden at `lg` where the columns already read as sections.

### 4. Sticky footer
- `DialogFooter` becomes `sticky bottom-0` on mobile with safe-area padding, Cancel/Save as equal-width full-width buttons (`flex-1`), so Save is always reachable.

### 5. Landscape phones
- Because the cropper/preview heights are `vh`-based with `min-h` floors, landscape stays workable; add `landscape:h-[70vh]`-style tightening only where the fixed heights would exceed the viewport.

## Not changing
- No crop maths, pricing, save payload, or 3D rendering logic. `useCropperZoom` already derives the crop frame from the measured container, so the new mobile heights flow through automatically.
- No changes to `CanvasPrintsBuilder.tsx` (its grid already stacks correctly) unless testing shows a tile-grid issue.

## Verification
- Playwright at 390×844 (portrait) and 844×390 (landscape): open a canvas, screenshot, confirm the crop frame is fully within the viewport, the page scrolls as one, and Save is visible.
