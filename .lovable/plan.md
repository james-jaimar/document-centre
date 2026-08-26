# Template editor: honour trim, square corners, publish clarity

## What I confirmed first

- The layout you created (`Design 7 - Blue`, A2 Deskpads) is saved with **status = draft** in the database. The customer page only lists published layouts, which is why it says "No artwork layouts are published for this product yet." The navigation URL is correct — the route exists and renders the artwork builder.
- The stored trim size is 608.8 × 434.8 mm. A2 is 594 × 420 mm, so the template is currently being measured from the **crop/media box including the crop marks and bleed**, not the trim box.
- Rasterisation (`rasterisePdfPages`) uses the default pdf.js viewport, which is the crop box — that is the source of both the oversized page and the crop marks showing in the editor.

## Changes

### 1. Honour the trim box everywhere
- Read the page's TrimBox with pdf-lib (fallback order: TrimBox → CropBox → MediaBox).
- Render each page as today, then crop the canvas to the trim rectangle so crop marks and bleed are excluded.
- Return the trim size in mm, so a page like this reports 594 × 420 mm.
- Both the admin editor and the customer builder use the same function, so the customer sees exactly the trimmed artwork.
- On upload, `trim_width_mm` / `trim_height_mm` are stored from the trim box. Existing templates are corrected by re-uploading, or by a small "Re-detect size" action next to the base PDF button.

### 2. Square corners
- The template stage in the box editor and the customer preview lose the rounded corner radius — a printed sheet must read as a sharp-cornered rectangle. Border and page shadow stay.

### 3. Publish clarity
- The draft/published state is easy to miss. In the template header the badge becomes explicit ("Draft — not visible to customers" / "Published"), and the Publish button gets a confirmation toast.
- On the customer page, when a family has layouts that are all drafts, the empty state stays the same for customers; no behaviour change is needed beyond publishing the layout.

## Technical notes

- `src/lib/artworkTemplates/pdfPages.ts` — add trim-box detection via pdf-lib and canvas cropping; extend `RasterisedPage` with the trim offsets used.
- `src/components/artwork/TemplateBoxEditor.tsx` — stage container corner radius removed.
- `src/pages/dashboard/TemplatedArtworkBuilder.tsx` — preview canvas corner radius removed; no other change (it already consumes `rasterisePdfPages`).
- `src/components/admin/ArtworkTemplatesTab.tsx` — clearer status badge, optional "Re-detect size" action that re-reads the stored base PDF and updates the trim dimensions.
- No database or RLS change is required.
