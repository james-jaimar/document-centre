You're right — adding the loose-sheets slug was only part of it. I checked the actual recent uploads and found the important clue:

- Recent `Stapled & Loose Pages` uploads **are now calling** `normalize_orientation`.
- For the same Word document, the backend job reports `pages_rotated: 20`.
- But after that, the size-scaling step runs and can put pages back onto same-orientation canvases, and the new static PDF preview path is also signing `documents.file_path`, which is the **original DOCX/PDF upload**, not the backend `normalized_storage_path` that contains the rotated/print-ready PDF.

So the rotation work exists, but the preview can still display the wrong source, and the resize path can undo the desired loose-sheets portrait constraint.

Plan:

1. Make the static PDF preview use the processed PDF, not the original upload
   - In `PreviewPanel`, stop using `doc.file_path` as the PDF source for inline PDF rendering when a backend asset exists.
   - Add a lightweight lookup for each document's `backend_asset_id` to fetch the asset and use `asset.normalized_storage_path` first, falling back to `source_storage_path` only if no normalized PDF exists.
   - This ensures loose sheets, posters, flyers, and other static PDF-workflow products display the actual PDF produced by the server pipeline.
   - Bound/flipbook products can continue using thumbnail paths as before.

2. Preserve the loose-sheets portrait constraint after size scaling
   - In `OrderFiles.applyScaleTo`, after `resize(...)` completes, check `requiredOrientationFor(productFamily?.slug)`.
   - If the product requires portrait/landscape, call `normalizeOrientation(workingAssetId, required)` **after resize and before print-ready/render**.
   - This matters because the current sequence is effectively:
     ```text
     Office -> PDF -> normalize_orientation -> size advisory -> resize -> print-ready -> render
     ```
     and `resize_pages` currently preserves each page's orientation. For loose sheets, we need:
     ```text
     Office -> PDF -> inspect -> resize if needed -> normalize_orientation -> print-ready -> render/display
     ```

3. Add a defensive final orientation pass before rendering any PDF-workflow document
   - In the shared finalisation path, ensure products with a required orientation have had `normalizeOrientation` run on the current asset before `printReady` and before previews are generated.
   - Keep this product-policy driven so:
     - Bound documents, ring binders, booklets: portrait enforcement remains.
     - Presentations: landscape enforcement remains.
     - Stapled/loose pages: portrait enforcement is added and kept.
     - Flyers/posters: still no forced orientation.

4. Record the final orientation result in preflight metadata
   - Persist something like `orientation_normalized: true`, `orientation_target: "portrait"`, and optionally `orientation_pages_rotated` from the job result.
   - This makes it obvious from the database/UI diagnostics whether the step actually ran.

5. Update comments/docs so this doesn’t regress again
   - Update the upload-flow comments to reflect the true order: conversion/resize first when needed, then orientation normalisation, then CMYK/print-ready, then render/display.
   - Update `.lovable/plan.md` to note the actual root cause: processed PDF not used by inline preview plus resize after orientation.

Expected result:
- A Word document with mixed portrait/landscape pages uploaded to `Stapled & Loose Pages` will have landscape pages rotated 90° clockwise into portrait.
- The final preview will render from the backend-normalised PDF, not the original DOCX/original PDF path.
- Flyers and posters will continue to honour landscape uploads without forced portrait rotation.