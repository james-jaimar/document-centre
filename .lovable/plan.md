## What I found

The latest uploaded `pull up banner2.pdf` is now correctly recognised as **850 × 2000mm** and the database row has already been changed to:

- `detected_size: Pull Up Banner`
- `size_resolved: true`
- `awaiting_review: false`

But it is still stuck as `document_status: processing` with **no thumbnails**. That means the modal no longer appears because the review flag was cleared, but the upload was never moved into the final render/ready path.

## Fix plan

1. **Stop treating recognised custom sizes as a review case**
   - In the upload inspection path, include the product-family custom sizes when deciding if a file is a valid size.
   - If the uploaded dimensions match a catalogue size like `Pull Up Banner 850 × 2000mm`, do not set `awaiting_review` and do not defer rendering.

2. **Finalize and render matched custom-size files automatically**
   - When a file matches an allowed custom size, run the same print-ready and thumbnail render path as a normal ISO upload.
   - Set the session size lock to that custom size so later uploads in the same order remain consistent.

3. **Repair the stale fallback path in `OrderFiles.tsx`**
   - The current fallback clears `awaiting_review` for a stale custom-size row, but only updates preflight data.
   - Change it so it also kicks off finalization/rendering, or uses the existing keep-original flow, so the file cannot sit forever as `processing`.

4. **Add a self-heal for rows already in this broken state**
   - If a document is `processing`, has `size_resolved: true`, has no thumbnails, and has a backend asset, reconcile/render it automatically.
   - This should recover the file you just uploaded without needing another re-upload.

5. **Verify against the real data path**
   - Confirm the latest `pull up banner2.pdf` moves from `processing` to `ready` and receives thumbnails.
   - Confirm no advisory modal appears for a valid 850 × 2000mm Pull Up Banner upload.

## Files to change

- `src/hooks/useDocumentUpload.ts`
- `src/pages/dashboard/OrderFiles.tsx`

No database schema changes are needed.