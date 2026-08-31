# Bleed-aware template canvas with a dotted trim line

Today the template page is rasterised cropped to the **trim box**, and every placeholder is clamped inside that trim. So a picture box can never reach past the edge, and there is nothing to bleed off. This changes the working area to the **bleed box** (trim + bleed on all four sides), while keeping placeholder coordinates measured from the trim's top-left corner — which is what the PDF server already assumes.

Result: a box placed at `x = -3mm, y = -3mm, 606 x 206 mm` on a 600 x 200 trim bleeds cleanly off all edges, and everyone (admin and customer) sees a dotted line showing where the sheet actually cuts.

## What changes for you

- The editor stage and the customer builder show the full bleed area, slightly larger than the finished sheet.
- A dashed trim line is drawn over the artwork, with the area outside it dimmed slightly so it reads as "this gets cut off".
- Boxes can be dragged/typed out past the trim, up to the bleed edge (not further).
- Numeric fields accept negative values down to `-bleed`.
- Nothing changes in the produced PDF geometry — placements are still anchored to the trim origin, so bleeding boxes simply land in the bleed area of the base page.

## Technical detail

1. `src/lib/artworkTemplates/pdfPages.ts`
   - Add `cropTo?: "trim" | "bleed"` (default stays `trim` for existing callers).
   - When `bleed`, crop to the PDF's BleedBox if present, else the trim box expanded by the template's bleed (clamped to the crop/media box).
   - Return extra fields on `RasterisedPage`: `bleedLeftMm/TopMm/RightMm/BottomMm` (actual inset achieved) alongside the existing trim `widthMm/heightMm`.

2. `src/lib/artworkTemplates/renderTemplate.ts`
   - `ComposeOptions` gains `bleedLeftMm`/`bleedTopMm` (default 0) and `canvasWidthMm`.
   - `pxPerMm` derives from `canvasWidthMm` (trim + left + right bleed); every placeholder rect shifts by `bleedLeft/bleedTop`.
   - New `showTrimLine?: boolean` draws the dashed trim rectangle plus a light dim over the bleed margin (proof/preview only — never in production output).

3. `src/components/artwork/TemplateBoxEditor.tsx`
   - Stage aspect ratio and percentage maths switch to the bleed canvas.
   - `clampBox` allows `x_mm >= -bleedLeft`, `y_mm >= -bleedTop`, and right/bottom edges up to `trim + bleed`.
   - Dashed trim overlay + caption ("Trim 600 x 200 mm, 3 mm bleed shown").
   - Numeric inputs allow negatives; add a "Bleed off edges" helper that snaps the selected box to full-bleed.

4. `src/components/admin/ArtworkTemplatesTab.tsx`
   - Rasterise with `cropTo: "bleed"`, store the detected bleed on the template (`bleed_mm`) when the PDF carries a bleed box, and pass the bleed insets to the editor.

5. Customer + proof surfaces — pass the same bleed insets and `showTrimLine`:
   `TemplatedArtworkBuilder.tsx`, `ArtworkProofModal.tsx`, `ArtworkAdminProof.tsx`, and `proofPdf.ts` (proof PDF keeps the dotted trim line, since it is a proof).

6. `pdf-server/app/services/templated_artwork_assembly.py`
   - No geometry change needed: placements are already anchored at `trim_x_pt / trim_top_pt`, so negative `x_mm`/`y_mm` extend into the bleed. Verification step only: confirm nothing clamps placement rects to the trim and that raster layers are composed at full page size.

## Verification

- Load the calendar template in the admin editor: stage shows a 3 mm margin outside a dashed trim rectangle.
- Set a cover image box to `-3, -3, 606 x 206`; it visibly overhangs on all sides in editor, customer builder and proof.
- Regenerate the production PDF and confirm the image reaches the media/bleed edge with the trim box unchanged.
