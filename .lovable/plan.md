# Templated artwork: true trim geometry, dynamic DPI, PDF placements

## What I verified first

- `src/lib/artworkTemplates/pdfPages.ts` already reads TrimBox → CropBox → MediaBox and crops the raster, but it **skips any page whose rotation is not 0** and only crops when the trim is smaller than the *crop* box. Your A2 deskpad still reports 609 × 435 mm, so the file's TrimBox is either absent, equal to the crop box, or the page is rotated — the editor is therefore measuring against the marks-and-bleed sheet, not the 594 × 420 trim.
- The PDF server (`pdf-server/app/services/templated_artwork_assembly.py`) **stretches** the placeholder mm grid across the full MediaBox: `sx = page_w_pt / (trim_w_mm * mm)`. There is no trim origin, so as soon as trim ≠ media the boxes are both scaled and shifted. Trim offsets are not stored anywhere today (`artwork_templates` has only `trim_width_mm`, `trim_height_mm`, `bleed_mm`).
- Customer DPI is computed once from the source pixel width vs the box width (`placementDpi` in `PlaceholderPanel.tsx`) — it ignores zoom and fit, so it never changes when the artwork is scaled.
- PDF uploads already work on the customer side: `TemplatedArtworkBuilder.tsx` detects `application/pdf` and rasterises page 1 for placement.
- "From phone" is wired through `onPhoneUpload` in `PlaceholderPanel.tsx`.
- I could not reproduce the text-box error from code alone: the DB table allows `kind = 'text'`, and the RLS write policy covers tenant admins. The exact message is needed, so step 3 below starts by reproducing it.

## Changes

### 1. Trim is the single source of truth (editor → proof → print)

- Store the trim rectangle, not just its size: add `trim_offset_x_mm` and `trim_offset_y_mm` to `artwork_templates` (offset of the trim box inside the media box, top-left origin).
- Improve detection in `pdfPages.ts`: fall back TrimBox → ArtBox → BleedBox-minus-bleed → CropBox, handle rotated pages (90/180/270) by mapping the box through the rotation instead of bailing out, and return the offsets alongside the size.
- Admin override in the template header: editable **Trim width / height / offset X / offset Y** fields next to "Re-detect size", so when a supplied PDF has no usable TrimBox you can type 594 × 420 and the editor crops to exactly that. A "centre trim on page" helper fills the offsets for you.
- The editor stage, the customer stage, the proof modal and the filmstrip all render the cropped trim raster, and every mm readout in the inspector is relative to the trim top-left — matching what you measure in Illustrator.

### 2. Pass trim through to the PDF server

- Include `trim_offset_x_mm` / `trim_offset_y_mm` in the `templated_artwork` spec snapshot written by `TemplatedArtworkBuilder.tsx`.
- Rewrite the overlay maths in `templated_artwork_assembly.py`: place boxes at **1:1 scale** anchored to the trim origin (`x_pt = (trim_off_x + x_mm) * mm`, y flipped from the trim top edge) instead of stretching. Font sizes stop being rescaled too, so 12 pt prints as 12 pt. Existing orders without offsets fall back to the current behaviour.

### 3. Text placeholder error

- Reproduce "add text box" in the editor and capture the real message (console + network). Fix the actual cause and add a visible error toast rather than a silent throw. No guessed fix goes in until the message is in hand.

### 4. Remove "From phone"

- Drop the phone-upload button and its handler from the customer placeholder panel — these are designer-supplied files.

### 5. Live DPI

- Replace the static badge with an **effective DPI** derived from the pixels actually landing in the box: `source_px_used / (box_mm / 25.4)`, recomputed on every zoom / pan / fit change (fill crops, so it uses the covered portion).
- Colour bands stay: red under 150, amber under 250, green above.

### 6. PDF placements

- Keep accepting PDFs. On upload, page 1 is rasterised at a high fixed density for the on-screen proof, and the **original PDF is kept** as the production asset so print output stays vector.
- Vector PDFs get a "Vector — scales cleanly" chip instead of a DPI number; PDFs whose page-1 content is a single raster image report a real DPI from that image's pixel size.
- Production: the server places a PDF placement by embedding and clipping the source page rather than converting to JPEG.

## Technical notes

- Migration: two nullable numeric columns on `artwork_templates` (default 0). No RLS change.
- Touched: `src/lib/artworkTemplates/pdfPages.ts`, `types.ts`, `renderTemplate.ts`, `src/components/admin/ArtworkTemplatesTab.tsx`, `src/components/artwork/TemplateBoxEditor.tsx`, `PlaceholderPanel.tsx`, `ArtworkProofModal.tsx`, `src/pages/dashboard/TemplatedArtworkBuilder.tsx`, `pdf-server/app/services/templated_artwork_assembly.py`.
- Existing templates keep working: offsets default to 0, which reproduces today's behaviour until you re-detect or type a trim.
