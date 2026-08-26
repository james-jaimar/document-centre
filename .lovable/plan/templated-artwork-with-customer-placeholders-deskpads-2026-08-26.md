# Templated artwork with customer placeholders (Deskpads)

A new product kind in Document Centre where the admin uploads a finished 12-page PDF and draws placeholder boxes on it. Customers can't touch the layout — they drop an image or PDF into each image placeholder, type into each text placeholder, see a live proof of all 12 pages, and the same content repeats on every page. On checkout the GCP PDF server stamps the real artwork into the real PDF and produces the print-ready file.

Pricing is deliberately out of scope here; it reuses whatever the family is wired to today and gets its own pass next.

## Decisions locked in

- Admin uploads one 12-page PDF. Dates and layout are already in that artwork — we never generate a calendar grid.
- Text placeholders are text-only for the customer. Admin fixes font, size, colour, alignment, box.
- Every placeholder repeats identically across all 12 pages. No per-month overrides in v1.
- Built here in Document Centre as a new product kind, not a remix.

## 1. New product kind: `templated_artwork`

Added alongside `photo_print` and `canvas_wrap` in the family-kind list, so admins can set a family (e.g. "Deskpad Calendars") to this kind. Orders on that family route to the new builder, the same way canvas prints already redirect.

## 2. Admin: template library and box editor

New admin screen under the product family:

- Upload the 12-page base PDF (stored in the existing Cape Town S3 bucket, path only in the DB). It stays a PDF — we also render page 1 to an image purely as the editor/preview backdrop.
- Page 1 renders on a zoom/pan canvas. The admin draws rectangles on it:
  - **Image placeholder** — name, x/y/w/h in mm off the trim box, fit mode (fit/fill), optional corner radius, optional background colour, optional lock.
  - **Text placeholder** — name, box, font family/size/weight, colour, alignment, max characters, default text.
- A numeric x/y/w/h panel next to the canvas for precise placement, plus snapping and nudge keys.
- Preview thumbnails for all 12 pages so the admin can confirm the boxes land sensibly on every month.
- Templates have draft/published status; only published ones appear to customers.

## 3. Customer: deskpad builder

New builder screen, patterned on the canvas-prints builder (upload → crop → live preview → cart):

- Layout gallery when a family has multiple templates; skipped when there's only one.
- Left column: one control card per placeholder.
  - Image: upload a PDF or image (PDF page 1 rasterised, as canvas prints already does), then fit/fill, scale slider, 9-way position pad, background colour, and a resolution/DPI warning badge.
  - Text: a plain input with the admin's character limit. Styling is displayed, not editable.
- Centre: live proof of the selected page — the rasterised template page with the customer's content composited into the boxes, with optional safe-area and bleed guides.
- Bottom: a 12-page thumbnail strip (JAN…DEC) plus a confirmation line that all pages use the same artwork.
- Right: order summary, quantity, artwork-quality status, an "I have reviewed my artwork" tick, and Add to cart.
- Undo/redo on placeholder edits, and autosave into the order spec so a refresh doesn't lose work.
- The existing QR mobile-upload flow is reused for uploading from a phone.

## 4. Print-ready output

The PDF server gets a new `compose-template` operation: take the base template PDF, and for each page stamp every image placeholder (from the original upload at full resolution, not the preview raster) and every text placeholder into its box, honouring bleed and CMYK conversion. Output is the 12-page print-ready PDF, handed to the existing `enqueue-print-ready` / `production-pdf` path so admin job screens and imposition work unchanged.

## 5. Order of work

1. Product kind + routing so a family can be marked as templated artwork.
2. Template and placeholder schema, with grants and RLS mirroring the existing catalogue tables.
3. Admin box editor.
4. Customer builder with live preview.
5. PDF server compose operation, wired into print-ready.
6. Pricing pass (separate, after the above).

## Technical notes

- New tables: `artwork_templates` (family/tenant/branch scope, base PDF path, page count, trim size in mm, bleed, status) and `artwork_template_placeholders` (template_id, kind `image`|`text`, name, x/y/w/h mm, fit mode, radius, text style JSON, max length, default value, sort order). Both get explicit GRANTs plus RLS.
- Order spec stored as `order_items.spec.templated_artwork` = `{ template_id, placeholders: [{ placeholder_id, kind, document_id, storage_path, crop, zoom, offset, fit, background }] }` for images and `{ placeholder_id, kind: "text", value }` for text — same shape family as `CanvasPrintEntry`, so tile/editor patterns port over.
- Preview compositing is client-side canvas over the rasterised template page; production compositing is server-side from the original PDF/images. The preview raster is never used for print.
- Reuses `rasterisePdfPageOneToImage`, `DebouncedColorInput`, `ResolutionBadge`, the `s3-storage` signed-URL flow, and the `pdf-api` proxy.
- Template PDFs, customer uploads and print-ready output all live in the existing af-south-1 S3 buckets; the DB stores paths only.
- Fonts for text placeholders must exist both in the browser (for preview) and on the PDF server (for output) — we start with the fonts already installed on the server so preview and print match.
