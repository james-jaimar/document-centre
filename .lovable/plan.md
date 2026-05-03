I’ve pinned down the specific failure path now.

The problem is not “Word conversion” in general and it is not “presentations” or “bound documents” globally anymore. The latest failing case is specifically:

```text
Office conversion
→ initial portrait normalisation works
→ user chooses Scale to A4
→ resize creates the A4 PDF
→ print-ready runs after resize
→ the final PDF used for preview is the print-ready PDF
→ landscape pages reappear / render landscape again
```

The database confirms this on the ring-binder upload:

- Asset: `cf00c494-0496-4066-a721-13655a67500f`
- Product: `ring-binders`
- Job order:
  1. `convert_office` completed
  2. `normalize_orientation` rotated 20 of 24 pages to portrait
  3. `resize_pdf` scaled to A4
  4. `print_ready` ran after resize
  5. final `normalize_orientation` reported `pages_rotated: 0`, because the PDF metadata said the pages were portrait
  6. generated previews still show pages 3+ as landscape-sized images (`1520×1075`), while pages 1–2 are portrait (`1075×1520`)

So the issue is exactly what you described: the scale-to-A4 route is leaving the final preview/render source in a state where the print-ready/resize output has portrait page boxes but some page content still renders as landscape. Our current verification only checks page dimensions/metadata, so it falsely accepts the file.

Plan:

1. Stop doing orientation as a fragile side-effect after scaling
   - Replace the current `resize → print_ready → normalize_orientation` handoff for mandatory-orientation products with a single finalising path that makes the last mutating operation responsible for both size and orientation.
   - For ring binders, bound documents, booklets, and stapled/loose pages, scaling to A4 must produce an A4 portrait PDF where every page rasterizes portrait.
   - For presentations, scaling must produce landscape output.

2. Fix the backend resize operation so it physically rotates content before fitting to the target page
   - Update `pdf-server/app/services/pdf_ops.py` `resize_pages()` to avoid the current temporary `writer.add_blank_page(...); writer.pages.pop()` pattern.
   - Build each output page from a clean blank target canvas in one pass:
     - bake any `/Rotate` hint into content
     - determine visual orientation
     - if the product requires portrait/landscape, rotate the artwork physically
     - scale and centre it onto the requested target page size
     - clear residual rotation flags
   - The output file must have no dependency on viewer `/Rotate` hints for correctness.

3. Make print-ready orientation-safe for resized files
   - In `pdf-server/app/tasks/operation_tasks.py`, when `print_ready` receives `dominant_orientation`, run a render-based orientation repair/verification after Ghostscript, not just metadata-based `normalize_orientation`.
   - This is needed because Ghostscript can output pages whose boxes look portrait while rendered artwork is effectively landscape.
   - If the final rendered previews would be landscape for a portrait product, the job should not silently pass.

4. Add a hard post-process verification step
   - Add a backend helper that rasterizes low-resolution page probes after resize/print-ready and verifies actual rendered width/height against `dominant_orientation`.
   - If a portrait product produces any landscape-rendered pages, fail the job with page numbers instead of marking the document ready.
   - This removes the “metadata says OK, screenshot is wrong” failure mode.

5. Fix the frontend scale flow to always pass orientation through finalisation
   - In `src/pages/dashboard/OrderFiles.tsx`, make `applyScaleTo()` always call finalisation after resize for required-orientation products, even if `preflight_data.print_ready_done` was already true from an earlier step.
   - The current `if (!preflightForFinalize?.print_ready_done)` guard is unsafe after geometry changes. Scaling invalidates print-ready/orientation state.
   - After resize, explicitly treat `print_ready_done` as stale and force the final pass.

6. Correct preflight state after geometry-changing operations
   - When scale/trim/rotate changes the PDF, update `preflight_data` so old flags cannot suppress required work:
     - clear stale `print_ready_done` before finalising
     - set `processed_file_path` only after the final promoted PDF exists
     - clear stale preview/thumbnail paths before render
   - This prevents an earlier “done” flag from hiding a later resize.

7. Update production-time resizing safety
   - `src/lib/orders/mutations.ts` also has a production resize helper that calls `resize()` without `dominantOrientation`.
   - Pass the required orientation there as well, or avoid re-resizing documents that were already finalized during upload.
   - This prevents checkout/order placement from reintroducing the same problem later.

8. Verify using the exact failing path
   - Re-test the ring-binder flow with the same Word document and “Scale to A4”.
   - Confirm the final derived preview pages are all portrait dimensions, especially pages 3–22.
   - Confirm bound documents kept at Letter still work.
   - Confirm presentations with landscape documents still work.

Files to change:

- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/tasks/operation_tasks.py`
- `src/pages/dashboard/OrderFiles.tsx`
- `src/hooks/useDocumentUpload.ts`
- `src/lib/orders/mutations.ts`
- possibly `src/lib/documentCentreApi.ts` only if the client API needs a new verification/finalisation endpoint

The key behavioural change: after any scale operation, the system will no longer trust old `print_ready_done` or page metadata. It will force the final orientation-aware pass and verify the rendered result before showing the client preview.