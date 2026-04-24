

## Photo Prints — three fixes

Three tightly-scoped fixes. Nothing else changes.

---

### 1. The "Preparing your prints…" modal is doing real work — and that's fine, but it shouldn't be in front of the customer

**What it actually is**

When the customer clicks **Add to Cart**, `usePhotoRenderQueue` runs in the browser and orchestrates the Document Centre PDF server. The browser does **not** rasterise or merge anything itself — it just makes API calls:

1. `createAsset` (one per photo)
2. `cropRasterize` at 300 DPI (one per photo) → polled
3. `resize` to print size (one per photo) → polled
4. `merge` all pages into one PDF → polled
5. Insert one `documents` row pointing at the merged PDF

So the heavy lifting is on the PDF server, exactly as you wanted. The modal just shows progress while the browser waits for those server jobs to finish.

**The problem with showing it to the customer**

For 4 photos × ~5 server calls each = 20+ sequential round-trips before the cart is reached. That's slow and exposes server plumbing.

**Fix — move it off the cart path entirely**

1. **Add to Cart returns instantly.** It writes the spec (with all crop/zoom/rotation state) to the order item and goes straight to the cart. The customer sees no "preparing" modal.
2. **Render runs server-side, kicked off in the background** by a new edge function `render-photo-prints`. It accepts the `order_item_id`, reads `spec.photo_prints`, performs the same `createAsset → cropRasterize → resize → merge` chain, then writes back:
   - the merged PDF storage path onto `spec.photo_prints.merged_storage_path` and `merged_asset_id`
   - one `documents` row tied to the order item with `kind: "photo_prints_merged"`.
3. The frontend fires the edge function with `fetch(..., { keepalive: true })` and immediately navigates to the cart. No modal, no waiting.
4. If render hasn't finished by the time the admin opens the order, the gallery shows a small "Print-ready PDF being prepared" pill instead of the Download button. A 5-second poll (admin side only) flips it to the Download button when ready. No customer-visible "preparing" UI anywhere.

**What gets removed**: the `UploadProgressModal` usage in `PhotoPrintsBuilder` for the render queue, and the entire `setMergeProgress` / progress-tracking surface in `usePhotoRenderQueue` for the cart flow (the hook itself stays for any future "regenerate" button on the admin side).

---

### 2. Admin order detail — the photo gallery isn't showing, and the file list is overlapping

**Why the gallery doesn't render**

`JobDetailPanel.tsx` mounts `PhotoPrintsAdminGallery` only when `config.photo_prints` exists, but `buildJobSnapshot` never copies `spec.photo_prints` onto `config.photo_prints` — it only emits a flat "Photos" config section. So the gallery is dead code today.

That's why your screenshot shows no preview: the snapshot builder doesn't surface the data the gallery needs.

**Fix**

1. In `buildJobSnapshot.ts`, when the family is `photo-prints`, write the full `photo_prints` block (with `photos`, `print_size_slug`, `finish_slug`, `border_slug`, `merged_storage_path`, `merged_asset_id`) onto `configuration.photo_prints` so the gallery has what it needs.
2. In `buildJobSnapshot.ts`, **suppress** the auto-generated `Files` section and the duplicate `Photos` section when the job is photo-prints — the gallery replaces both. This also fixes the overlapping `1341198799653586…5.jpg 13 MB · 1355×762mm` text in your second screenshot, because that section won't render at all for photo-prints jobs.
3. In `JobDetailPanel.tsx`, also hide the `Customer's Attached Files` block when `config.photo_prints` is present — same reason.
4. The existing `PhotoPrintsAdminGallery` already shows: cropped preview tiles, filename, size, ×qty badge, and the Download Print-ready PDF button. No changes needed there beyond the polling pill from §1.

Result: the admin sees a clean tile grid identical to what the customer saw, with one prominent **Print-ready PDF** download button at the top.

---

### 3. Edge function `render-photo-prints` (new)

A thin server-side equivalent of the existing `usePhotoRenderQueue`:

- Auth via `supabase.auth.getUser()` (project standard).
- Looks up the `order_item` and verifies the caller is the owner or staff.
- Walks `spec.photo_prints.photos`, calling the existing Document Centre proxy (`pdf-api`) for `createAsset` / `cropRasterize` / `resize` / `merge` — same exact steps the browser does today, just running serverless.
- Polls each job until done (or times out gracefully — failure is recorded on the spec for the admin to retry).
- Inserts the `documents` row and patches `spec.photo_prints.merged_*` on the order item.
- Returns immediately after kickoff if invoked with `?async=1` (uses `EdgeRuntime.waitUntil`), so the frontend's `keepalive` POST is non-blocking.

No DB schema changes. No changes to other product flows. No customer-visible progress UI.

---

## Files to change

| File | Change |
|---|---|
| `src/hooks/usePhotoRenderQueue.ts` | Keep helpers but no longer used on the cart path |
| `src/pages/dashboard/PhotoPrintsBuilder.tsx` | Remove modal & blocking render; fire edge function and navigate to cart immediately |
| `src/lib/orders/buildJobSnapshot.ts` | Surface `configuration.photo_prints`; skip auto Files/Photos sections for photo-prints jobs |
| `src/components/orders/detail/JobDetailPanel.tsx` | Hide attached-files list when `config.photo_prints` is present; rely on gallery |
| `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` | Add a tiny poll: if `merged_storage_path` missing, refetch every 5 s and show "Preparing print-ready PDF…" pill |
| `supabase/functions/render-photo-prints/index.ts` (new) | Server-side render + merge orchestrator |
| `supabase/config.toml` | Register the new function |

## Verification checklist

1. Add to Cart on a 4-photo order returns within ~1 s, no modal, customer lands in cart.
2. Within ~10–30 s the merged PDF appears in the order's `documents` table with `preflight_data.kind = "photo_prints_merged"`.
3. Admin opens the order → sees a tile grid (cropped previews, ×qty badges, filename, size) and a **Print-ready PDF** button.
4. The overlapping `Files` text block on the admin view is gone for photo-prints jobs.
5. If admin opens the order before render completes, gallery shows "Preparing print-ready PDF…" then auto-flips to the Download button.
6. No regressions to bound documents, brochures, ring binders, or any other product family.

