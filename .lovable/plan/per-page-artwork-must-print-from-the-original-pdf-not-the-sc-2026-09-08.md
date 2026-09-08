# Per-page artwork must print from the original PDF, not the screen image

## What I confirmed in the code

Your file is stored correctly. When a 12-page PDF is spread across the 12 months, the builder
saves, for every month, both the on-screen preview picture **and** a pointer to the original
uploaded PDF plus which page of it belongs there
(`src/pages/dashboard/TemplatedArtworkBuilder.tsx`, `source_pdf_path` / `source_pdf_page`).

The print composer then throws that pointer away. In
`pdf-server/app/services/templated_artwork_assembly.py`:

- Line 797: `pdf_src = v.get("source_pdf_path") if page is None else None` — the original-PDF
  route is deliberately switched off for anything placed on a specific page, so all 12 months
  fall back to the screen picture.
- The vector placement list is only built from the "same picture on every page" values, and
  `_stamp_vector_placements` always takes page 1 of the source and stamps it on every sheet, so
  it could not handle "page 3 of the file goes on month 3" even if it were reached.

Second, why it is RGB: the browser-rendered pages are PNGs with an alpha channel, and
`_encoded_jpeg` keeps any image with alpha as an RGBA PNG (line 331). Only opaque images get
converted to CMYK. So the fallback picture lands as RGB.

## The fix

1. **Place the real PDF page for per-page artwork.** Allow the original-PDF route when a value
   carries a page index: download the source once and reuse it for every month that points at
   it.
2. **Honour the page number.** Each placement records which page of the source to use
   (`source_pdf_page`, 1-based) and which sheet of the output it belongs on.
   `_stamp_vector_placements` selects that source page and stamps it only on its own sheet;
   repeat-mode placements keep stamping on every sheet as they do today.
3. **Don't double-draw.** The raster layer must skip a placeholder on the pages where the
   vector page was stamped, so the picture is not drawn under the real artwork. Today this is a
   single job-wide list; it becomes per page.
4. **Nothing may leave as RGB.** For any image that still goes down the raster route, flatten to
   CMYK unless the placeholder is genuinely a transparent overlay (watermarks, knockout art).
   Browser page renders are opaque, so they will convert.
5. **Bump the cache key.** `templated_artwork_pipeline_version` in
   `pdf-server/app/tasks/production_tasks.py` goes from 3 to 4 so your existing order re-composes
   instead of returning the bad cached PDF.
6. **Report it.** The assembly report gains a count of vector-placed pages and a per-placeholder
   note when the original PDF could not be used and the picture was substituted — so a silent
   downgrade is visible in the admin panel instead of being discovered on press.

## Verification

Re-run the print-ready assembly for the affected job and check the output with `pdffonts`
(the header's fonts appear, meaning it is live text, not a picture), `pdfimages -list` (no
full-width header image on the 12 pages), and `pdfinfo`/colour inspection (no DeviceRGB in the
placed content). I will also state clearly if any month falls back to the raster.

## Technical notes

- Files: `pdf-server/app/services/templated_artwork_assembly.py` (asset fetch, placement
  collection, stamping, raster skip list, CMYK), `pdf-server/app/tasks/production_tasks.py`
  (pipeline version).
- No frontend changes — the data the builder saves is already correct.
- The overall CMYK/ICC conversion (`to_print_ready_cmyk`) remains a separate step; this change
  makes sure the assembled artwork is vector and CMYK-safe going into it.
