# Let staff download the customer's uploaded PDF from a job

## What's wrong

On the admin job panel the customer's file appears twice, and neither is clickable:

- The "FILES" line you can see on CAL-26005-1 (`PQ Naidoo Attorneys (17) 2027 A2 deskpad…pdf · 12p · 5.1 MB · 594×420mm`) is just descriptive text baked into the job's saved specification — it is a label, not a link.
- The separate "Customer's Attached Files" box lower down styles the names in blue with a pointer cursor, but has no click behaviour at all, so clicking does nothing.

The actual uploaded files are already loaded on that page (they are what drives the preview), and the app already has a working, properly-named download service — it just isn't wired to these files.

## The fix

Turn the customer's uploaded files into a real, downloadable list on the job panel:

- One "Customer's uploaded files" card per job, listing each uploaded document with its original name, page count and size.
- A Download button on each row that saves the file to disk with a readable name: `<order number>-<job number>-<original file name>.pdf` (e.g. `CAL-26005-CAL-26005-1-2027-A2-deskpad.pdf`), matching how the print-ready download already behaves.
- A "Download all" action when a job has more than one file.
- Spinner while the download is being prepared, and a clear error message if it fails.
- The old non-clickable list is replaced by this card, so a file never appears as dead text again.

## Technical notes

- `JobDetailPanel.tsx` already receives `sourceDocuments` (fetched in `fetchOrderDetail` via `documents.order_item_id in (...)`) plus `jobDocs` from `order_documents`. Merge the two by storage path, de-duplicating, using `sourceDocumentsForJob(job, sourceDocuments)` for the job-scoped set.
- Path resolution reuses the existing precedence in `previewFallbacks.ts`: `processed_file_path` → `file_path` → `storage_path`. Download the original upload, not the processed derivative — so prefer `file_path`/`storage_path` and only fall back to processed.
- Download goes through `downloadObject(objectPath, filename)` from `src/lib/downloadFile.ts` (already streams via the `download` action of the `s3-storage` edge function with `Content-Disposition: attachment`), and `buildFilename([orderNumber, jobNumber, originalName])` for the name.
- No database, edge function or pricing changes; presentation only.

## Verification

Open CAL-26005 in Impress Print, press Download on the customer file, and confirm it saves as a PDF named after the order rather than doing nothing.
