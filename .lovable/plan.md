I found the two regressions and they are connected to recent “cleanup” changes.

What is actually going wrong:

1. Trim works for presentations because the file is left landscape. The preview render job is receiving `render_box: [TrimBox]`, and the rendered PNG is correctly 1871×1323, matching the finished A4 landscape trim.
2. Trim fails after rotating for bound documents because `normalize_orientation` creates a new portrait PDF with only `MediaBox`. It discards the original `TrimBox/BleedBox/ArtBox`. Then `handleRotateOrientation` calls `renderWithProgress(..., null)`, so the renderer has no trim box left and renders the whole rotated media canvas, including bleed/crop marks.
3. The frontend then records the rotated page size from the asset `MediaBox` as about 224.8×311.8mm instead of finished A4 210×297mm. That is why the preview is searching/selecting against the wrong shape after rotation.
4. Binding artwork is not truly using a strict one-to-one asset map. `bindingAssets.ts` still contains deep fallbacks and legacy fallback artwork. Also it maps “Twin Loop White” to `white`, but there is no white twin-loop artwork imported, so it falls back to black/legacy rather than surfacing the missing mapping clearly. This is exactly the “can’t find the image / wrong asset” class of issue.

Plan to fix properly:

1. Preserve and transform trim boxes during orientation normalization
   - Update `pdf-server/app/services/pdf_ops.py` so `normalize_orientation` carries each page’s original `TrimBox`, `BleedBox`, `CropBox`, and `ArtBox` through rotation.
   - When a page is rotated to portrait/landscape, transform the box geometry onto the new swapped page canvas instead of losing it.
   - After rotation, `inspect()` should still report a real `TrimBox` smaller than `MediaBox`, with dimensions equivalent to the finished page.

2. Make preview rendering always re-derive the correct render box after geometry-changing operations
   - Add a backend-side helper in the generate-preview path that, when the caller passes no `render_box`, inspects the current PDF and auto-selects `TrimBox`/`BleedBox` if present and smaller than `MediaBox`.
   - This closes the gap where frontend callers pass `null` after rotate/resize/print-ready and accidentally render MediaBox.
   - Keep the existing safety rule: do not use a page-1 MediaBox as a global crop. Only use an explicit real trim/bleed box.

3. Fix rotated document dimensions on the frontend
   - In `OrderFiles.tsx`, after `normalizeOrientation`, derive `page_width_mm/page_height_mm` from the refreshed asset’s `TrimBox` first, then `CropBox`, then `MediaBox`.
   - Pass that refreshed trim box into `renderWithProgress` after rotation, rather than `null`.
   - Persist `preflight_data.effective_width_mm/effective_height_mm` and `trim_box_pt` so the file list, size lock, Configure guard, and preview all use the finished document size, not the media canvas.

4. Purge binding fallbacks and make the asset map authoritative
   - Refactor `src/components/preview/bindingAssets.ts` so the resolver returns only exact supported tuples: `(method, colour, edge, state) -> PNG`.
   - Remove legacy fallback returns and opposite-edge/default-colour fallbacks. If an option has no exact asset, log a clear diagnostic and do not draw a fake/CSS binding.
   - Keep the existing actual artwork for spiral black/clear/white, comb black, twin-loop black/silver, long/short, open/closed.
   - For configured options that do not have artwork (notably Twin Loop White if still present in product option data), either map it deliberately to an available asset only if that is intended, or remove/flag that option as unsupported in preview. I will first inspect the seeded option values and use the product data as the source of truth.

5. Restore binding edge logic to product reality
   - For portrait-bound products, use long-edge artwork.
   - For presentation/true landscape products, use the short-edge 210mm artwork.
   - Do not infer binding edge from a stale media canvas after rotation; use the product family/orientation policy and selected document size.

6. Add guardrails so this cannot regress silently again
   - Add backend unit/smoke checks around a PDF with `MediaBox != TrimBox`: normalize to portrait, inspect boxes, generate previews, and verify preview aspect matches TrimBox.
   - Add a small frontend resolver check for every seeded binding option that should render artwork, confirming the exact PNG exists.
   - Run typecheck/tests after the changes.

Files expected to change:
- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/tasks/document_tasks.py`
- `pdf-server/app/tasks/operation_tasks.py` if result metadata needs to include transformed trim boxes
- `src/pages/dashboard/OrderFiles.tsx`
- `src/components/preview/bindingAssets.ts`
- Possibly `src/components/preview/BindingSpine.tsx` only to remove assumptions left over from fallback behaviour
- Possibly `src/lib/productOptionValues.ts` if seeded binding options include colours with no supplied artwork

Expected outcome:
- Uploading the same landscape PDF to Bound Documents, rotating it to portrait, then previewing/configuring will show the finished trimmed page edge, not the media box/crop marks.
- The document’s effective size will remain A4 finished size after rotation, not the oversized media canvas.
- Presentations continue to render to TrimBox as they currently do.
- Binding artwork will be a deterministic one-to-one mapping. No CSS fallback. No silent wrong-colour/wrong-edge fallback.