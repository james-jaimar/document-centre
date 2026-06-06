## What I found

- The latest preview job did complete successfully in the backend:
  - `generate_previews` job `60dc3374-e8ce-482b-8ef4-9902864ac81c`
  - Status: `completed`
  - Rendered `24/24` pages
- The document row is still `document_status = processing` with `preflight_data.awaiting_review = true` and no `thumbnail_urls` saved.
- The uploaded PDF is detected as **US Letter** (`215.9 × 279.4mm`), while the product/session appears to expect an SA/ISO size, so the app correctly flags a size advisory. But the current flow can leave the upload modal saying “Rendering pages…” instead of cleanly transitioning to “Review needed” / closing.

## Root issue to fix

There are two frontend flow problems:

1. **Advisory-state uploads are not finalised cleanly**
   - When a size advisory is present, the code leaves the document as `processing` with `awaiting_review=true`.
   - That is valid for the document list, but the upload modal should not keep behaving like active rendering is still happening.

2. **Preallocated preview-job polling can wait on the wrong state**
   - `prepare_for_product` may pre-create a `preview_job_id` before it actually enqueues the render task.
   - The frontend polls that preallocated job directly. If the chain is not dispatched as expected, the UI can sit at 75% for a long time even though later/manual preview generation may complete.

## Implementation plan

1. **Update upload finalisation in `src/hooks/useDocumentUpload.ts`**
   - For advisory uploads, mark the upload modal item as done once the advisory metadata is saved.
   - Keep the document row as `processing` + `awaiting_review=true` so the file card still shows “Review needed”.
   - Use status text like `Review needed` instead of `Rendering pages…`.

2. **Harden the preview-render step**
   - If a prechained preview job id is missing or remains non-running too long, fall back to explicitly calling `generatePreviews(assetId, renderBox)`.
   - This prevents the frontend from being trapped polling a preallocated job that was never dispatched.

3. **Make thumbnail persistence recover from already-rendered previews**
   - After `generate_previews` completes, always re-read `derived_files` and write `documents.thumbnail_urls` when all pages exist.
   - If the backend has already rendered all pages but the document row was not updated, the frontend can self-heal without another upload.

4. **Add better timeout/error handling for polling**
   - Keep normal jobs polling long enough for real work.
   - Add a shorter guard for preallocated chained preview jobs so the fallback starts quickly instead of waiting for minutes.

5. **Validation**
   - Re-check the affected document/asset state in Supabase after the change.
   - Confirm new uploads either:
     - finish and show thumbnails, or
     - finish the modal and show “Review needed” for US Letter/custom-size advisory files.

## Immediate state note

The current uploaded file is not lost: its backend asset is rendered and ready. The visible stuck state is the app failing to transition/persist the document UI state after that processing path.