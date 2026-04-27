I agree with the process you described. The current broken point is now clear from the latest data: the rotation job is promoting a portrait MediaBox, but the rotated asset has lost TrimBox/BleedBox/CropBox metadata, so `generate_previews` has no trim box to crop to and renders the full media canvas.

## Plan

1. Restore trim boxes through rotation correctly
   - Fix `pdf-server/app/services/pdf_ops.py` so `normalize_orientation` captures page boxes before any transform that can discard them.
   - Rotate each declared box (`TrimBox`, `BleedBox`, `CropBox`, `ArtBox`) into the new portrait coordinate system.
   - Ensure the rotated PDF’s metadata looks like:
     - `MediaBox`: portrait full canvas including bleed/crop area
     - `TrimBox`: portrait finished page size
     - `BleedBox` / `CropBox` / `ArtBox`: transformed equivalents where present
   - The database currently shows the failed rotated asset only has `MediaBox`; after this fix it must retain `TrimBox`.

2. Make the rotated/trimmed PDF the new render source of truth
   - After `/operations/normalize-orientation`, keep the promoted `normalized_storage_path` as the authoritative PDF for the asset.
   - Clear previous page renders, preview paths, and thumbnail paths before generating new previews.
   - Re-inspect the rotated PDF and persist the rotated boxes and finished dimensions.
   - When previews are generated, crop against the rotated PDF’s own `TrimBox`, not a stale pre-rotation box from the document row.

3. Remove the client-side trim-box guess from the rotation flow
   - In `OrderFiles.tsx`, after rotation, do not calculate and pass a possibly stale `renderBoxForPreview` from client state.
   - Call preview generation with no explicit render box so the server derives the render box from the newly rotated PDF it just promoted.
   - Update the document row using the refreshed asset boxes after rotation, so `page_width_mm` / `page_height_mm` reflect the finished trim size, not the media size.

4. Fix stored document preflight metadata after rotation
   - The current document row has stale pre-rotation boxes in `preflight_data` while the backend asset has only the rotated MediaBox. That mismatch is why the UI reports confused dimensions.
   - Persist the refreshed backend asset’s boxes into `preflight_data.boxes` after rotation.
   - Persist `effective_width_mm` / `effective_height_mm` from the rotated TrimBox once preserved.

5. Restore binding artwork loading without CSS fallbacks
   - Keep `BindingSpine` asset-only: no CSS spiral fallback.
   - Restore the previously working resolver behaviour for asset availability: use the actual PNG imports already in `src/assets/bindings`, including the known-good generated asset URLs used by the published app.
   - Do not render a wrong CSS placeholder; if a requested exact asset is missing, either use the published-app’s known binding image fallback ladder to an existing PNG, or fail visibly in development logs while still ensuring supported product options map to real files.
   - Confirm every supported binding option maps to real artwork for:
     - Spiral: black, white, clear
     - Comb: black
     - Twin loop wire: black, silver
     - Edges: long and short
     - States: closed and open

6. Add a regression check for this exact flow
   - Add a small backend test/helper check for a landscape PDF with MediaBox + TrimBox:
     - inspect original: landscape TrimBox exists
     - normalize to portrait
     - inspect output: portrait MediaBox and portrait TrimBox both exist
     - derive render box returns the rotated TrimBox
   - Add/adjust frontend mapping checks so every seeded binding option resolves to an actual imported artwork path.

## Expected result

For the file in your screenshot:

```text
Upload landscape PDF with bleed/crop marks
→ detect landscape for a portrait-bound product
→ rotate PDF to portrait
→ rotated PDF keeps transformed TrimBox
→ server crops previews to that rotated TrimBox
→ thumbnails/previews show finished edge-to-edge page, not MediaBox/crop marks
→ document dimensions become finished portrait size
→ binding artwork resolves to the matching PNG asset, not CSS and not a broken image
```

## Files to update

- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/tasks/operation_tasks.py`
- `pdf-server/app/tasks/document_tasks.py` if needed for render-box derivation metadata
- `src/pages/dashboard/OrderFiles.tsx`
- `src/components/preview/bindingAssets.ts`
- `src/components/preview/BindingSpine.tsx` if needed for resolver integration
- A lightweight test/check file or existing test hook for the rotation/box and binding mapping regressions