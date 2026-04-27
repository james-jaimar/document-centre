# Fix Photo Prints editor + uploader bugs

Two bugs in the Photo Prints builder:

1. **Editor doesn't size portrait/square photos properly.** Fill/Fit buttons don't actually do anything to the image, Rotate leaves it stuck, and you can't zoom out far enough to see the whole picture inside the print frame.
2. **Drag-and-drop disappears after the first upload.** Once at least one photo exists, the big drop area is replaced by a small "Add more photos" bar with only a button — you can't drop files on it anymore.

## What will change

### 1. Photo editor (`src/components/photo/PhotoEditorModal.tsx`)

- Compute the image's natural aspect ratio (rotation-aware) once it loads, then derive:
  - **`fitZoom`** — the zoom value that makes the *entire* image visible inside the print frame (letterboxed). Always ≤ 1.
  - **`fillZoom`** — the zoom value that fills the frame edge-to-edge with no gaps (always 1 when `objectFit="cover"`).
- Lower the cropper's `minZoom` to `fitZoom` so users can actually zoom out to see the whole photo.
- Wire **Fill** and **Fit** buttons to set `zoom` to `fillZoom` / `fitZoom` respectively (and reset `crop` to `{0,0}` so it re-centres). This is what users expect today and currently it's a no-op.
- Recompute fit/fill zooms whenever **Rotate 90°** is pressed (since rotation flips the effective aspect ratio), and snap to the current `fitMode` so the rotated image stays sensibly framed instead of getting stuck.
- Keep the zoom slider min in sync with `fitZoom` so the slider can reach the "see whole photo" position.
- Reset should set `zoom = fillZoom` (current behaviour of "1") which matches the default fill mode.

### 2. Uploader (`src/pages/dashboard/PhotoPrintsBuilder.tsx`)

- After the first photo is added, the "1 photo added / Add more photos" header bar will gain drag-and-drop:
  - Add `onDragOver` / `onDragLeave` / `onDrop` handlers that call the existing `handleFiles`.
  - Add a subtle drag-active visual state (border + background tint) so users know it's a drop target.
  - Keep the existing "Add more photos" button + hidden file input as the click affordance.
- No change to `PhotoUploader.tsx` — that component is unchanged and still used for the empty state.

## Out of scope

- No changes to upload pipeline, storage paths, server-side rendering, or the tile preview maths.
- No changes to print-size aspect or border logic.

## Files touched

- `src/components/photo/PhotoEditorModal.tsx` — fit/fill/rotate zoom logic, dynamic minZoom.
- `src/pages/dashboard/PhotoPrintsBuilder.tsx` — drag-and-drop on the "Add more photos" bar.
