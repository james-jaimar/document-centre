# White cover artwork disappears — confirmed cause

I rendered page 1 of `Landscape-01-Gallery-2027-12-Months-v2.pdf` two ways:

- Flattened onto white: the page looks blank (only crop marks).
- Rendered with alpha and composited on a dark background: the white "2027 / ANNUAL CALENDAR" type appears exactly where you expect it.

So the artwork is genuinely there, and it is pure white on a fully transparent page.

That is what breaks it. Both the browser preview and the print assembly run a "knock out white" pass that turns every near-white pixel transparent, so the template's own white type is erased along with the (already transparent) background.

- Preview: `src/lib/artworkTemplates/pdfPages.ts` always runs the knockout (`knockoutWhite !== false`, tolerance 12).
- Print: `pdf-server/app/services/templated_artwork_assembly.py` runs the same pass in `_knockout_base_page` when the template has `base_knockout_white` on.

The knockout only ever existed for templates exported with a solid white background rectangle. This template is exported transparent, so the pass is unnecessary here — and destructive.

## Fix

Make the knockout self-detecting: if the rasterised page already has real transparency, leave it alone.

1. `src/lib/artworkTemplates/pdfPages.ts` — in `knockoutWhiteInPlace`, sample the alpha channel first (every ~40th pixel). If more than 5% of samples are already transparent, return without touching pixels. Templates with a white background rectangle have ~0% transparent pixels, so they keep working exactly as now.
2. `pdf-server/app/services/templated_artwork_assembly.py` — same guard at the top of `_knockout_base_page`: after loading the mutool RGBA render, if a meaningful share of pixels already has `a == 0`, save the render untouched (still returns True, so `under`-layer boxes still show through).

## Result

- Calendar cover: white type renders on screen and in the production PDF, over the customer's photo.
- Deskpads and any template exported with a white background: unchanged behaviour.
- No schema, admin UI, or pricing changes.
