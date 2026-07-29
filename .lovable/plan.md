## Bug
QR upload completes on the phone (mobile-upload writes a `documents` row) but Canvas Prints shows nothing. `CanvasPrintsBuilder`'s `onFilesReceived` callback only calls `qc.invalidateQueries(...)` — there is no code path that converts the new document rows into `spec.canvases` entries.

`PhotoPrintsBuilder` does have an ingest path, but it reads `source_width_px` / `source_height_px` from `preflight_data`, and `supabase/functions/mobile-upload/index.ts` never writes those fields. So mobile-uploaded photos come in with 0×0 dimensions, breaking cropping.

## Fix

### 1. `src/pages/dashboard/CanvasPrintsBuilder.tsx`
Replace the placeholder `onFilesReceived` with an async handler that mirrors the desktop `handleFiles` flow:

- Fetch the received document rows (`id, file_name, file_path, mime_type`) by ID.
- For each doc:
  - `getDownloadUrls([file_path])` to get a signed URL.
  - Load the URL into an `Image()` client-side to read `naturalWidth` / `naturalHeight`.
  - Build a `CanvasPrintEntry` with `original_storage_path = file_path`, `defaultSize` / `defaultWrap`, and the measured dimensions. Leave `preview_path` undefined — `CanvasTile` and the editor already fall back to `original_storage_path`.
- `setSpec((prev) => ({ canvases: [...prev.canvases, ...newEntries] }))`.
- Auto-open the editor for the first new entry and toast the count (parity with desktop upload).

### 2. `src/pages/dashboard/PhotoPrintsBuilder.tsx`
In its existing `onFilesReceived`, before pushing entries, fetch a signed URL per doc and read the image dimensions client-side. Populate `source_width_px` / `source_height_px` from the loaded image (fall back to `preflight_data` if present). Run `applyDefaultCrop` so crops render correctly on first view.

### 3. Reset the QR session after ingest
On `handleClose` the modal already calls `closeSession`; no change needed. Nothing else in `useUploadSession`, `QRUploadModal`, or the `mobile-upload` edge function needs to change for this fix.

## Verification
- Canvas Prints → Upload from Phone → scan QR → send a photo from phone → tap **Done** → tile appears with correct wrap/size and the editor auto-opens.
- Photo Prints → same flow → tile appears with correct dimensions and a sensible default crop.
- Desktop drag-drop upload path is untouched.
