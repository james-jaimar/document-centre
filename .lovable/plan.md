

## Photo Prints — polish pass (icon, editor fidelity, white border, single merged PDF, admin preview)

Five tightly-scoped fixes to the new Photo Prints flow. Nothing else in the app changes.

---

### 1. Use the Photo Prints hero image on the My Print Centre tile

`CustomerDashboard.tsx` already maps slugs → product images via `SLUG_IMAGE_MAP`, but it does **not** include `photo-prints`. The Create page (`NewOrder.tsx`) already does, hence the discrepancy.

**Fix**: import `photoPrintsImg` in `CustomerDashboard.tsx` and add `"photo-prints": photoPrintsImg` to its `SLUG_IMAGE_MAP`. One-line addition + import.

---

### 2. Editor preview drift — accurately reflect saved crop/zoom/rotation on the tile

Current behaviour: saving crop/zoom/rotation in the editor and returning to the grid shows a tile that doesn't match what was just visible inside the editor, and re-opening the editor reapplies stale state.

Root causes:

- `PhotoTile.tsx` derives its CSS transform from `croppedAreaPixels` *without accounting for rotation* — `react-easy-crop` returns `croppedAreaPixels` in the **rotated source's coordinate space**, so applying `rotate()` afterwards produces a different framing than the cropper showed.
- The tile uses `transform-origin: top left` plus a percentage-based translate calibrated only for unrotated images, so any rotation throws the framing off-centre.
- When re-opening the editor, the saved `crop` (UI-space pixels) and `zoom` are restored, but `croppedAreaPixels` is also re-pushed to react-easy-crop on first mount, causing a one-frame mismatch where the cropper recalculates and produces a slightly different `croppedAreaPixels` value than what was saved.

**Fix**:
1. Replace `PhotoTile.tsx`'s transform-based "fake crop" with a real, faithful preview built on a `<canvas>` rendered from the source image using the saved `croppedAreaPixels` + `rotation`. Same maths the backend will use, so what the user sees on the tile is exactly what will print.
2. Cache the rendered canvas as a data URL in component state, keyed by `(croppedAreaPixels, rotation, signedUrl)` so it only re-renders when the saved state actually changes.
3. In `PhotoEditorModal.tsx`, when opening with an existing `croppedAreaPixels`, derive `zoom` and `crop` from the saved `croppedAreaPixels` rather than restoring the raw `crop`/`zoom` numbers blindly. This keeps re-edits stable.
4. Drop the `restrictPosition={fitMode === "fill"}` toggle's interaction with `objectFit` — currently switching Fit/Fill mid-edit changes both the cropper's coordinate space and `croppedAreaPixels`, which is what produces the "goes funny" behaviour. Lock `objectFit="cover"` for fill and only change behaviour on save.

This makes the tile, the editor, and the final render mathematically consistent.

---

### 3. White Border option must show in the preview and be honoured at render time

Currently selecting "White Border (3 mm)" updates the spec but is invisible in the tile and the editor. The backend `resize` call also ignores it.

**Fix**:
1. `PhotoTile.tsx`: when `border_slug !== "none"`, wrap the cropped image in an inner box with white padding proportional to the chosen border (3 mm scaled against the print size's long edge → percentage). Background of the outer aspect-ratio frame becomes white so the border shows.
2. `PhotoEditorModal.tsx`: render a non-interactive white inset overlay inside the cropper at the same proportional thickness, so the user sees the printable area shrink when they enable Border. Add a small caption: `White border (3 mm)`.
3. Render queue: when `border_slug === "white_3mm"`, after `cropRasterize` call `resize(asset, contentW_mm, contentH_mm, "fit")` against the inset content area, then place that page inside a `width_mm × height_mm` page using the existing `resize` with `fit_mode="fit"` against the full size. (Border is implicit white padding from `fit`.)

---

### 4. Confirm S3 storage (no change required)

Yes — `usePhotoUpload.ts` calls `uploadToS3(storagePath, file)` writing originals to:

```
tenants/<tenantId>/uploads/<userId>/<orderItemId>/photos/<uuid>_<filename>
```

This is the same `document-uploads` S3 bucket used by every other file. Documented here for the user; no code change needed.

---

### 5. Render ONE consolidated print-ready PDF on Add to Cart

Today `usePhotoRenderQueue` registers and resizes each photo as its own asset and stores nothing back on the order. Production has no single deliverable.

**Fix** — rewrite `usePhotoRenderQueue.ts` to produce one merged PDF for the whole order:

1. For each photo entry (in grid order, repeated by `quantity` so duplicates appear consecutively in the final PDF):
   - `createAsset` with original image
   - `cropRasterize(asset, box, 300)` using the saved `croppedAreaPixels`
   - `resize(asset, width_mm, height_mm, fit_mode)` — using the print-size dimensions
   - When border is on, apply the inset technique from §3.
   - Wait for each job via `pollJob`.
2. Collect the resulting per-photo asset IDs.
3. Call `merge(assetIds, "photo-prints-<orderItemId>.pdf")` (already exposed by `documentCentreApi.ts`) and `pollJob` it.
4. Resolve the merged PDF's storage path via `getDerivedFiles(mergedAssetId)` (kind = `merged`).
5. Insert one row into the existing `order_documents` table for the merged PDF with:
   - `order_item_id = orderItem.id`
   - `document_type = "print_ready"`
   - `is_customer_visible = false`
   - `storage_path` = merged PDF path
   - `metadata.kind = "photo_prints_merged"`
6. Stash `{ merged_asset_id, merged_storage_path }` on `spec.photo_prints` so the admin order detail can link to it.

Result: production opens the order and gets one continuous N-page PDF (one page per print, in the correct order, repeated for quantity), borders applied if selected, ready to send straight to the photo printer.

The render-progress modal stays — total progress = (per-photo render % × n + merge step) / total steps.

---

### 6. Admin order detail — gallery preview of the customer's photo job

Today admin sees only filenames in the `Customer's Attached Files` block of `JobDetailPanel.tsx`.

**Fix**:
1. In `JobDetailPanel.tsx`, when `job.product_category` (or the underlying product family slug) is `photo-prints`, render a new `PhotoPrintsAdminGallery` component **above** the attached-files list.
2. The gallery reads `job.configuration.photo_prints` (already snapshotted at order-place time via §5 and existing `buildPhotoPrintsSection`) and shows a tile per photo with:
   - Cropped/rotated preview using the same canvas helper from §2 (single source of truth)
   - Filename
   - Print size
   - Quantity
   - Border indicator
3. Add a prominent "Download print-ready PDF" button at the top of the gallery linking to the merged file's signed URL (resolved via `resolveUrls` from the storage path saved in §5).
4. Also fix the existing snapshot bug: `buildPhotoPrintsSection` reads `spec.photo_prints` as an array, but `PhotoPrintsBuilder` writes `spec.photo_prints = { print_size_slug, finish_slug, border_slug, photos: [...] }`. Update the snapshot builder to read `spec.photo_prints.photos` and to include the global size/finish/border so the admin sees them.

---

## Files to change

| File | Change |
|---|---|
| `src/pages/dashboard/CustomerDashboard.tsx` | Add `photo-prints` to `SLUG_IMAGE_MAP` (§1) |
| `src/components/photo/PhotoTile.tsx` | Replace CSS-transform preview with canvas-based render; add white-border visualisation (§2, §3) |
| `src/components/photo/PhotoEditorModal.tsx` | Stable re-open from saved crop, white-border overlay, lock objectFit (§2, §3) |
| `src/lib/photoPrints/renderPreview.ts` (new) | Shared canvas helper used by tile, editor preview, and admin gallery |
| `src/hooks/usePhotoRenderQueue.ts` | Rewrite to merge into one PDF and persist `order_documents` row + spec metadata (§5) |
| `src/lib/orders/buildJobSnapshot.ts` | Fix `buildPhotoPrintsSection` to read `spec.photo_prints.photos`; emit size/finish/border (§6) |
| `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` (new) | Admin gallery (§6) |
| `src/components/orders/detail/JobDetailPanel.tsx` | Mount gallery for `photo-prints` jobs (§6) |

## Guardrails

- No changes to any non-photo product flow.
- No DB schema changes — reuses `documents`, `order_documents`, `order_items.spec`.
- No changes to FlipBook, RingBinder, Brochure preview code.
- Document Centre endpoints used (`createAsset`, `cropRasterize`, `resize`, `merge`, `getDerivedFiles`, `pollJob`) are already proxied through the existing `pdf-api` edge function — no new edge functions needed.

## Verification checklist

1. My Print Centre tile shows the photo-prints hero image, identical to Create.
2. Edit a photo → zoom, drag, rotate → Save → tile reflects exactly what was shown in the editor.
3. Re-open editor for a previously-saved photo → cropper shows the same framing, no jump.
4. Toggling White Border updates both the editor and the tile with a visible white inset.
5. Photos saved to S3 under `tenants/<id>/uploads/<user>/<item>/photos/...` (existing).
6. Add to Cart triggers the render modal → finishes → exactly one merged PDF appears in the order's `order_documents` (`document_type = print_ready`, `kind = photo_prints_merged`), with one page per print × quantity, borders honoured.
7. Admin opens the order → sees the photo gallery (cropped previews, sizes, qty) and a "Download print-ready PDF" button that returns the merged PDF.
8. No regressions in any other product family.

