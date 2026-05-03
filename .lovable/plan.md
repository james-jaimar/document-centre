I’m sorry. You are right: this should not be an 18-layer workflow. The current implementation is still too fragile because rotation, print-ready conversion, scaling, metadata inspection, and preview rendering are separate operations that can each promote a different PDF version.

The fix should be to stop trusting the frontend sequence and make the PDF server produce one final PDF in one authoritative operation.

Plan:

1. Add a single server-side “prepare for product” operation
   - New backend endpoint/task, conceptually:
     `prepare-pdf(asset_id, target_size?, required_orientation, print_ready_profile?)`
   - It will always download the current asset PDF, then perform the final workflow in one controlled place:
     1. Convert Office to PDF if needed before this stage, as today.
     2. Run print-ready/CMYK first if required.
     3. Bake all `/Rotate` hints into actual page content.
     4. Rotate pages whose real rendered orientation does not match the product requirement.
     5. Scale those already-rotated pages to A4/Letter/etc. if requested.
     6. Save and promote exactly that final PDF to `normalized_storage_path`.
   - After this point, the rest of the app only ever previews/prints that promoted PDF.

2. Replace the current split frontend flow
   - In `OrderFiles.tsx`, replace the manual `printReady -> resize -> render` chain in `applyScaleTo` with a single call to the new operation.
   - In `useDocumentUpload.ts`, replace the separate normalise/print-ready finalisation with the same server-side finaliser for products with required orientation.
   - Keep the existing size advisory UX, but once the user chooses “Scale to A4”, the frontend will only send intent: “this product is portrait; target is A4”. It will not try to manage rotation itself.

3. Remove the current false-success condition
   - Right now the database can say `page_width_mm=210`, `page_height_mm=297` even when the rendered artwork inside that portrait page is still landscape/squashed.
   - The new backend operation will not treat page box dimensions as proof.
   - It will perform a low-resolution render probe after the final PDF is produced and verify page-level rendered orientation.
   - If any page still renders landscape inside a portrait product, the job fails with page numbers instead of writing misleading “success” metadata.

4. Make resize itself safer on the PDF server
   - Update `pdf-server/app/services/pdf_ops.py` so `resize_pages` no longer uses an intermediate blank page attached to the writer and then popped.
   - Use a clean page composition path per page:
     - read page
     - bake rotation
     - if needed, rotate content onto an isolated temporary page
     - scale that page onto the final target canvas
     - write only the final target page
   - This removes the exact class of bug where content can remain landscape while the outer box becomes portrait.

5. Persist only the final processed path
   - After the backend finaliser completes, update `documents.preflight_data.processed_file_path` from the asset’s final `normalized_storage_path` only.
   - Clear stale previews/thumbnails every time geometry changes.
   - Re-render previews from the final PDF only.

6. Keep production/order placement consistent
   - Update `processDocumentForProduction` and cart/order submission paths to call the same finalisation operation, not a separate resize operation.
   - This prevents the preview from being correct while the production file is wrong, or vice versa.

Files to change after approval:

- `pdf-server/app/services/pdf_ops.py`
  - harden page rotation + scale composition
  - add render-probe verification helper
- `pdf-server/app/tasks/operation_tasks.py`
  - add the new final prepare task
  - promote only verified final PDFs
- `pdf-server/app/web/routes.py`
  - add endpoint for the final prepare operation
- `pdf-server/app/schemas/assets.py`
  - add request schema for the final prepare operation
- `src/lib/documentCentreApi.ts`
  - add client wrapper for the new operation
- `src/hooks/useDocumentUpload.ts`
  - use the final prepare operation for upload finalisation
- `src/pages/dashboard/OrderFiles.tsx`
  - use the final prepare operation for “Scale to A4” and “Keep original”
- `src/lib/orders/mutations.ts` and `src/hooks/useCart.ts`
  - use the same operation for production processing

Technical note:

The most suspicious thing I found is that the latest failed scaled document row says it is A4 and points at a resized PDF, but previous scaled attempts pointed at print-ready PDFs. That confirms the workflow has been promoting different derived PDFs at different stages. The correct fix is not another frontend reorder; it is to make the PDF server own one final PDF mutation and verify the rasterized result before the app marks the file ready.

This will require updating the PDF server files as well as Lovable-side files.