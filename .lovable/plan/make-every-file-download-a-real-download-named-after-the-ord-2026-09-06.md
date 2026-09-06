# Make every file download a real download, named after the order

## What's happening

Files live in S3 and are handed to the browser as a temporary signed link on the S3 domain. Two things follow from that:

- A link to another domain ignores the "save this file" instruction the app attaches, so the browser just displays the PDF instead of saving it.
- With no name supplied, the browser falls back to the storage key — the long random string you saw.

Some places in the app also deliberately open the file in a new tab (message attachments, for example), which is the same experience.

The one place that already works properly (the print-ready button on a job) only works for files under 25 MB, because it fetches the file into memory first and re-serves it locally with a proper name. Anything bigger falls back to the plain link and reverts to open-in-browser with the ugly name.

## The fix

1. Add a "download with a proper name" service to the storage function, so a file can be streamed back with an explicit filename and a "save me" instruction attached. Because it comes from our own domain, the browser always shows the save dialog / puts it in Downloads with the right name.
2. Add one shared helper (`src/lib/downloadFile.ts`) that every download button in the app calls: pass the storage path plus the desired filename, get a proper saved file. Large files keep streaming (no whole-file-in-memory buffering) and show a "download started" message.
3. Name files consistently from the order, not the database:
   - customer artwork / job files: `<order number>-<job number>-<original file name>.pdf`
   - production artefacts: existing `<order>-<job>-print-ready.pdf` pattern (already correct) moves onto the shared helper
   - invoices/quotes: `<invoice or quote number>.pdf` (already correct, moves onto the helper)
   - message attachments: original uploaded file name
4. Replace open-in-a-new-tab behaviour with the real download everywhere a Download button exists. Where a *view* action is genuinely wanted (preview an invoice), keep a separate "View" that opens inline — download stays a download.

## Screens updated

- Admin order/job detail — customer files and production artefacts
- Admin documents / invoices list
- Branch and customer quote pages
- Customer portal order files and recently-uploaded files
- Message attachment chips

## Technical notes

- New `sign-download-attachment` behaviour in `supabase/functions/s3-storage/index.ts`: signs, fetches, and re-emits the body with `Content-Disposition: attachment; filename="…"` and a passthrough `Content-Type`, streaming (no buffering) so large PDFs are safe.
- `src/lib/downloadFile.ts` exports `downloadObject(objectPath, filename)` and `downloadBlob(blob, filename)`; both use a same-origin anchor so `download` is honoured.
- Filename sanitiser moves out of `ProductionPanel.tsx` into the shared helper.
- Call sites updated: `ProductionPanel.tsx`, `AdminDocuments.tsx`, `OrderInvoicesList.tsx`, `MessageAttachmentChips.tsx`, `useQuotes.ts`, `lib/orders/mutations.ts`, `OrderFiles.tsx`.
- No database or pricing changes.

## Verification

Download a calendar PDF from an Impress Print job, an invoice, and a message attachment: each should save to disk with a readable, order-based name rather than opening in the browser tab.
