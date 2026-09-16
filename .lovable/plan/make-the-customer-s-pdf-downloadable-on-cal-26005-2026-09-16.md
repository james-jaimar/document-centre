# Make the customer's PDF downloadable on CAL-26005

## Why nothing shows

The download card was built, but on this job it has nothing to list, so it hides itself.

Checked the live record for CAL-26005-1:

- There is no row in the uploaded-documents table for this job (neither the source-upload table nor the job-attachments table) — both are empty.
- The only record of the customer's file is inside the job's saved specification: file name, 12 pages, 594x420mm, and the actual storage location of the PDF.
- The card only reads the two (empty) tables, so it renders nothing — which also explains "No customer preview available" on the same panel.

So the file is there in storage; the panel just isn't looking in the place where this order recorded it.

## The fix

Add the job's saved specification as a third source for the card:

- Read the approved artwork entry held in the job spec (file name, page count, storage location) and include it in the file list, de-duplicated against the other two sources by storage path.
- Cover both shapes the spec uses: the artwork entry at the top level and the same entry nested under the raw specification (this order uses the nested one).
- Everything else stays as built: Download button per row saving as `<order number>-<job number>-<file name>.pdf`, "Download all" for multiple files, spinner and error toast.

## Technical notes

- `buildCustomerFiles(sourceDocs, jobDocs)` in `src/components/orders/detail/CustomerFilesCard.tsx` gains a third argument: the job `configuration`. It maps `configuration.uploaded_artwork` and `configuration.raw_spec.uploaded_artwork` into `{ name: file_name, path: storage_path, pageCount: page_count }` entries, appended after the existing sources and de-duplicated by path.
- `JobDetailPanel.tsx` passes `config` into `buildCustomerFiles`.
- `ArtworkAdminProof` currently only receives `config.uploaded_artwork`; also pass the `raw_spec` fallback so the proof block appears for this order shape too.
- Download still goes through `downloadObject` + `buildFilename`; no database, edge function or pricing changes.

## Verification

Open CAL-26005 in Impress Print, confirm a "Customer's uploaded files" card lists the PQ Naidoo A2 deskpad PDF, and press Download to save it named after the order.
