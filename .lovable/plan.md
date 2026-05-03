I found the issue. The current pipeline is doing multiple jobs in sequence, but the resize step is not actually rotating the content when it is asked to force portrait. It creates a portrait A4 canvas and places the still-landscape page onto it. The job result then says the asset is portrait because the canvas is portrait, but the content inside the page is still sideways. That matches the screenshot: portrait page/canvas, but landscape content reduced/sideways inside it.

There is also evidence in the database for the latest Stapled & Loose upload:

```text
inspect_asset: pages 3-22 are landscape (792 x 612)
normalize_orientation: says 20 pages rotated
resize_pdf: creates A4 portrait canvas
print_ready: runs after that
preview output: pages 3-22 are still landscape images (1520 x 1075)
```

So the processed file path is being saved, but the processed file still contains landscape-rendered content after resize/print-ready. The flaw is not “passing the wrong file to the client” anymore; it is that the backend operation is lying by returning portrait page dimensions while leaving the artwork orientation wrong.

Implementation plan:

1. Add an atomic backend operation for this exact workflow
   - New operation: `fit_to_size_and_orientation` / endpoint under the existing PDF API.
   - Inputs: asset id, target width/height in mm, fit mode, required orientation (`portrait` for Stapled & Loose Pages).
   - It will do the whole transformation in one PDF pass:
     - bake any existing `/Rotate` hints into real content;
     - detect each page’s visual orientation;
     - if a page does not match required orientation, rotate the content 90° clockwise with the correct translation;
     - then scale/centre onto the target A4 portrait canvas;
     - save/promote that output as `asset.normalized_storage_path`.
   - This avoids the fragile “rotate job -> resize job -> normalize job -> print-ready job” handoff where one stage can neutralise the previous one.

2. Fix the PDF geometry math in the transform
   - The transform must not just change MediaBox/page size.
   - For landscape-to-portrait it must draw the old page into a new portrait page using the correct pypdf transformation order.
   - I’ll avoid relying on `/Rotate` flags for the final result; the final PDF should have portrait MediaBoxes and no residual page rotation hints.

3. Add a hard server-side verification step
   - After the atomic operation, re-inspect every page.
   - Fail the job if any page’s effective dimensions still violate the required orientation.
   - Store diagnostic counts in the job result, e.g. `pages_rotated`, `pages_verified`, `remaining_mismatches`.
   - This prevents the UI from saying “successfully scaled/rotated” when the PDF is still wrong.

4. Route loose/stapled A4 scaling through the atomic operation
   - In `OrderFiles.applyScaleTo`, when `requiredOrientationFor(productFamily.slug)` returns `portrait`, call the new atomic operation instead of generic `resize`.
   - Keep normal resize behaviour for products without forced orientation.
   - For no-size-advisory uploads, keep the existing finalize path, but update it to use the same atomic logic when a target size is known or when the product requires strict orientation.

5. Stop marking orientation as resolved from page-1 dimensions only
   - Update the final preflight update so `orientation_resolved` is only written after backend verification succeeds.
   - Do not rely on top-level asset width/height alone, because in this bug top-level dimensions were already portrait while pages 3-22 were still landscape.

6. Preserve the existing client preview/file handoff
   - Keep `processed_file_path = asset.normalized_storage_path`.
   - Keep clearing thumbnail/PDF caches.
   - Keep rendering from the processed file, not the original upload.
   - The difference is that the processed file will now actually be the final rotated-and-scaled PDF.

7. Clean up accidental generated Python cache files
   - Remove the committed `__pycache__/*.pyc` files that were created in the previous attempt.

8. Add targeted regression checks
   - Add backend-level tests or a small test fixture around a mixed portrait/landscape PDF:
     - input: pages 1-2 portrait, pages 3+ landscape;
     - operation: force portrait + A4 fit;
     - expected: every output page is portrait A4 and no `/Rotate` hint is needed for correctness.

The intended final flow will be:

```text
PDF upload
  -> inspect pages
  -> if Stapled & Loose and target A4 portrait is chosen:
       atomic rotate-if-needed + fit-to-A4
       verify every page is portrait
  -> print-ready if configured, with AutoRotatePages disabled
  -> render thumbnails/previews
  -> save processed_file_path
  -> customer receives the processed PDF
```

This is deliberately not a rewrite of the order system. It is replacing the broken part of the PDF transformation chain with one deterministic backend operation for “rotate these pages and scale them to A4”.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>