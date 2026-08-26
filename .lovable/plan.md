# Artwork templates: layers, behind-template placeholders, opacity

Three additions to the templated-artwork system, plus the answer to the "10% of a PDF" question.

## 1. Layers

Each placeholder gains two new properties:

- `layer` — `under` (behind the template) or `over` (on top, current behaviour, default).
- `z_index` — stacking order within its layer.

Admin editor (`TemplateBoxEditor.tsx`) gets a layer list panel beside the canvas: reorder with drag or up/down buttons, toggle a box between Above template / Behind template, plus lock and visibility as they exist today. The browser proof and the PDF server both draw in the order `under` (by z_index) → template page → `over` (by z_index), so preview and print always agree.

## 2. Placeholders behind the template

Merge order changes on the server: instead of stamping one overlay on top of the base page, we build an *underlay* page, merge the base page over it, then merge the *overlay* on top.

That only shows through if the base PDF is actually transparent where the artwork should appear. Two supported routes, chosen per template in the admin:

- **Transparent base PDF (preferred).** The designer exports the template with no white background rectangle. Nothing else needed — vector stays vector, no rasterisation.
- **Knock out white (fallback).** Admin ticks "Base has a white background — knock it out". On upload we rasterise the base at 400 dpi, make near-white pixels transparent (with a tolerance slider), and store a transparent PNG alongside the PDF. Assembly then composes: underlay → transparent PNG of the template → overlay. Text in the template stays crisp at 400 dpi but is no longer vector, so this is offered as the fallback, not the default.

The browser proof mirrors both routes: the existing rasterised page is drawn with white knocked out when that flag is on, so a behind-template image is visible in the editor and in the proof modal.

## 3. Opacity (the 10% watermark)

Each image placeholder gains an `opacity` value (0–100%), exposed as a slider in the customer panel and as a default in the admin box inspector. Text placeholders get the same control.

- **Browser proof:** `ctx.globalAlpha` before drawing the image/text.
- **PDF output:** real PDF transparency via an `ExtGState` with `/ca` and `/CA` set to the opacity, not a faked white blend. This keeps CMYK intact and works whether the placeholder sits above or below the template.

### How we do 10% on an uploaded PDF

Today a customer PDF is rasterised to a JPEG in the browser and only that JPEG reaches the server, so a PDF placement is already a raster. We change that:

1. The browser keeps rasterising page 1 for the on-screen editor (fast, and gives us the DPI badge), **but the original PDF is also uploaded** and recorded on the spec as `source_pdf_path`.
2. At assembly, when `source_pdf_path` is present the server places the *vector* page, not the JPEG: pikepdf copies the customer's page 1 into the output as a Form XObject, wrapped in a graphics state whose `/ca` and `/CA` equal the chosen opacity. The whole placed group — vectors, text and images inside it — is rendered at 10%, exactly like an Illustrator opacity on a group. No rasterisation, no quality loss, and it prints correctly on press.
3. Fit/fill, zoom and pan map onto the XObject's transformation matrix, so placement maths stays identical to the raster path.
4. If the PDF can't be embedded (encrypted, or a PDF version pikepdf refuses), we fall back to rendering it with mutool at 400 dpi and applying the same ExtGState alpha to the raster. The job report notes which path was used.

One caveat worth stating up front: constant-alpha on a group is not the same as "each object at 10%" — overlapping shapes inside the customer's own PDF will not darken where they overlap. That is the behaviour designers expect from a group opacity, and it is what Illustrator's "Opacity 10%" on a group does too.

## Technical notes

- Migration: add `layer` (text, default `over`), `z_index` (int, default 0) and `opacity` (numeric, default 1) to `artwork_template_placeholders`; add `base_knockout_white` (bool) and `base_transparent_path` (text) to `artwork_templates`. Grants follow the existing pattern on those tables.
- Types: extend `ArtworkPlaceholder` and `TemplatedImageValue`/`TemplatedTextValue` in `src/lib/artworkTemplates/types.ts`; the order-time `placeholder_defs` snapshot carries the new fields so existing orders keep rendering unchanged (missing values default to `over` / `1.0`).
- `renderTemplate.ts`: split the draw loop into under/over passes around the page image, honour `z_index` and `globalAlpha`.
- `pdfPages.ts`: optional white-knockout when rasterising the base for the editor.
- `templated_artwork_assembly.py`: `_render_overlay` gains a `layer` filter and alpha (`c.setFillAlpha` / `c.setStrokeAlpha`); the page loop builds underlay + overlay; new helper places a customer PDF page as a Form XObject via pikepdf.
- Uploads: `TemplatedArtworkBuilder.tsx` stores the original PDF next to the rasterised preview and sets `source_pdf_path`.
