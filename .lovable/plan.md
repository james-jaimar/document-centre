## Poster orientation audit

### What already works
- **PDF acceptance**: `orientationPolicy.ts` does NOT list `posters` as portrait- or landscape-required, so landscape PDFs (and images) upload without any rotation advisory or forced normalisation. ✓
- **Image uploads**: `PosterImageEditor` auto-detects orientation from the source image's natural aspect, exposes a Portrait/Landscape toggle, and `imageToPosterPdf` emits the PDF at the correct landscape dimensions (594×420 for A2-landscape, etc.). ✓
- **Pricing**: `calculatePrice.ts` looks up the size by its orientation-agnostic slug (`a2`, `a3`, …). Landscape A2 prices the same as portrait A2. ✓
- **Bleed / full-bleed rendering**: `buildPreviewSnapshot` and `PreviewPanel` force `isPoster` to full bleed regardless of orientation. ✓
- **Size auto-detect**: `matchesSize` already checks both portrait and landscape — a 594×420 PDF correctly matches the `a2` option. ✓

### The actual bug
`canvasSizeMm` in `src/pages/dashboard/OrderBuild.tsx` (lines 571-579) is derived purely from the **option's** `sizeMeta.orientation` flag. The poster `DOC_SIZE_POSTER` option values only carry portrait metadata, so even when the uploaded poster PDF is 594×420 (landscape A2), the canvas is forced to 420×594 (portrait A2). Result:
- Preview renders a portrait-shaped canvas with a landscape PDF letterboxed inside, OR
- Scale-mode "fill" crops the artwork.

Binding edge already solves this elsewhere by preferring the actual page geometry over the option metadata (`docPageOrientation` override, lines 599-613). The canvas calc never got the same treatment.

### Fix

Single, narrow change in `src/pages/dashboard/OrderBuild.tsx` `canvasSizeMm` memo:

1. Compute `docPageOrientation` once (already exists below — hoist or reuse it).
2. When `docPageOrientation` is known and disagrees with `sizeMeta.orientation`, prefer the document's orientation when swapping width/height.

Effective rule:
```
effectiveLandscape =
  docPageOrientation
    ? docPageOrientation === "landscape"
    : isLandscapeSize;
```
Then swap dimensions based on `effectiveLandscape`.

This keeps every other product working unchanged (bound docs, presentations, ring binders all also pass uploads matching their required orientation; presentations already lock landscape so the result is the same). It just lets posters (and flyers/business cards, which use the same canvas calc) follow the uploaded artwork's true shape.

### Files touched
- `src/pages/dashboard/OrderBuild.tsx` — one memo (~10 lines), no other call sites.

### Out of scope
- No new option values (no `a2-landscape` poster slug needed).
- No pricing changes.
- No new orientation policy entries — posters remain "any orientation OK".
- No preview component changes — `LooseSheetsPreview` already follows `pageAspectRatio` / `canvasSizeMm`.

### Verification
1. Upload a landscape A2 PDF to a Posters order → preview should render wide, full-bleed, with no letterboxing and the price line item still showing A2.
2. Upload a portrait A2 PDF → preview unchanged (still portrait).
3. Upload a landscape JPG → editor opens with Landscape preselected; after confirm, preview renders landscape.
4. Spot-check Flyers and Business Cards (same memo) — portrait artwork still previews portrait.
