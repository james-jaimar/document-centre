# Customer PDF uploads lose transparency (white box instead of white graphics)

## Confirmed cause

The template *base* page now rasterises with transparency, but the **customer upload** path does not.

`src/lib/canvasPrints/pdfToImage.ts` (`rasterisePdfPageOneToImage`, used by `TemplatedArtworkBuilder.handlePickFile`) does exactly two things that destroy alpha:

- fills the canvas with `#ffffff` before rendering (lines 35-36), and
- exports `image/jpeg` (line 43), a format with no alpha channel at all.

So a PDF containing only white vector graphics becomes an opaque white JPEG — which is what the screenshot shows.

Print output is less affected: the original PDF is also uploaded as `source_pdf_path` and the assembler places it as a vector Form XObject. But any raster that *does* carry alpha is still flattened onto white by `_flatten` in `templated_artwork_assembly.py` (line 92), so transparent PNG uploads would print wrong too.

## Fix

1. **New transparent rasteriser for templated artwork** — add an alpha-preserving variant (new function in `src/lib/canvasPrints/pdfToImage.ts`, or a small `rasterisePdfPageOneToPng` in `src/lib/artworkTemplates/pdfPages.ts`):
   - no white pre-fill; pass `background: "rgba(0,0,0,0)"` to `page.render`, same as the base-page fix;
   - export `image/png` so alpha survives;
   - keep the ~200 DPI / 2400 px long-edge target and the same `File` return shape so the upload pipeline is unchanged.

   `TemplatedArtworkBuilder.handlePickFile` calls this one instead. Canvas Prints keeps the existing white-flattened JPEG behaviour (a wrap needs opaque pixels), so nothing there changes.

2. **Preview compositing** — `renderTemplate.ts` already draws images with `drawImage` over whatever is beneath, so a transparent PNG composites correctly with no change. The only tweak: don't paint the placeholder `background_hex` fill when the value has none set (current behaviour already skips it when `bg` is null — verify only).

3. **Server: keep alpha on placed rasters** — in `templated_artwork_assembly.py`, when an image has an alpha channel, stop flattening onto white. Split it into a CMYK colour image plus a `/SMask` (grayscale alpha) so ReportLab draws it with real transparency: convert `RGBA → CMYK` for colour and pass the extracted alpha band as the image mask. Opaque images take the existing path untouched.

4. **Upload size sanity** — PNG at 2400 px can be several MB where the JPEG was under 1 MB. Uploads already allow up to 200 MB, so no limit change; the PNG path is only used for the templated-artwork builder.

## Verification

- Upload the white-vector PDF into an image placeholder on the calendar cover: the white graphics show over the photo/template, with no white block.
- Upload a normal photo PDF: unchanged appearance, correct DPI badge.
- Upload a transparent PNG logo: transparent in the builder, the proof modal, the proof PDF and the production PDF.
- Canvas Prints PDF upload: unchanged (still flattened to JPEG).
