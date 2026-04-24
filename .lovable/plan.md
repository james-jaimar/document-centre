## Fix admin photo previews for placed Photo Prints orders

The missing previews are not a checkout problem anymore.

The current admin gallery is doing something the rest of the app does not do: it re-opens the original private photo files at view time, runs them through a browser canvas crop/rotate renderer, and only then shows a preview.

That extra runtime pipeline is what is breaking. The screenshot shows `render failed` coming from `PhotoPrintsAdminGallery`, and the failure value is just an `Event`, which points to the image load/cross-origin stage rather than normal React rendering.

Flip previews work because they read an already-built preview snapshot. The photo admin gallery is the outlier.

## Plan

### 1. Make the admin gallery fail-open instead of spinning forever
Update `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` so each tile has 3 states:
- rendered crop preview
- direct signed original image fallback
- explicit "Preview unavailable" state

If `renderPhotoPreview(...)` fails, the tile must stop spinning and fall back immediately instead of staying blank.

### 2. Stop depending on view-time canvas rendering as the primary path
Refactor the gallery so the default display path is simpler and closer to the rest of the app:
- use the signed image URL directly for display
- only use canvas crop rendering as an enhancement, not a requirement

This removes the current hard dependency on:
- signed URL image load succeeding with canvas-safe CORS behavior
- `toDataURL()` succeeding
- redoing crop math every time an admin opens an order

### 3. Preserve existing photo metadata, but use it more defensively
Keep using the placed order’s immutable `configuration.photo_prints` snapshot for:
- file name
- quantity
- print size
- rotation / crop metadata

But do not require every historical order to have a perfect renderable crop preview. Older or incompatible orders should still show a usable image tile.

### 4. Add compatibility for existing orders
For already-placed photo orders:
- try to sign `original_storage_path`
- if crop-render succeeds, show it
- otherwise show the original signed image
- if signing fails too, show a clear unavailable state

That ensures current broken orders become viewable without needing re-placement.

### 5. Keep the rest of the photo order workflow simple
Do not reintroduce background render queues or special PDF-generation steps for admin previewing.

Photo Prints should remain:
```text
upload photos
-> store spec on order item
-> place order
-> snapshot photo metadata onto job configuration
-> admin reads snapshot and shows stable tiles
```

Not:
```text
open admin order
-> sign raw private images
-> canvas-render everything from scratch
-> fail if image/CORS/canvas step breaks
```

## Files to change

- `src/components/orders/detail/PhotoPrintsAdminGallery.tsx`
  - remove permanent-spinner behavior
  - add direct-image fallback
  - make canvas preview optional
- `src/lib/photoPrints/renderPreview.ts`
  - harden error handling so load/canvas failures are distinguishable
- `src/lib/orders/buildJobSnapshot.ts`
  - keep snapshot contract stable; only adjust if a small compatibility field helps the gallery

## Expected result

1. Admin order detail shows photo tiles reliably.
2. A failed crop render no longer means no preview at all.
3. Photo previews behave more like the rest of the app: resilient, read-only, and snapshot-driven.
4. Existing placed photo orders become viewable without changing checkout again.

## Technical details

Most likely failure point:
- `PhotoPrintsAdminGallery` signs `original_storage_path`
- `renderPhotoPreview()` loads that URL into an `Image` with `crossOrigin="anonymous"`
- the browser rejects the image for canvas use or the load fails
- the component logs `render failed` and stays in a loading UI

The implementation should treat canvas rendering as best-effort only, not as the only way an admin can see the ordered photos.