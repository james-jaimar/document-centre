## Bug

Multi-page flyer with proper TrimBox/BleedBox/CropBox + visible crop marks. User picks "Double-sided flyer" → system trims to 2 pages, but the final preview shows the **crop marks on the outside of the page**. The PDF server isn't being told to render to the TrimBox.

## Root cause

`src/lib/trimPdfPages.ts` uses pdf-lib's `PDFDocument.copyPages()` to rebuild the trimmed file. **pdf-lib's `copyPages` only carries the MediaBox across** — it silently drops `TrimBox`, `BleedBox`, `CropBox`, and `ArtBox` on the destination pages.

Downstream effect:
1. Trimmed PDF is uploaded back to S3 with no TrimBox.
2. `reprocessDocument` → `inspectDocument` re-registers the asset; the new asset's `boxes` has only MediaBox.
3. In `useDocumentUpload.inspectExistingAsset` (and the equivalent path off `inspectDocument`), the `explicitTrim` check fails (no TrimBox ≠ MediaBox), so `renderBox` is passed as `null`.
4. `generate-previews` / the loose-sheet preview falls back to the full MediaBox, which **includes the crop-mark gutter** — exactly what the user is seeing.

So the bug is not "communicating to the PDF server" — the trim step itself is destroying the trim metadata before the server ever sees the file again. Once the boxes are preserved, the existing TrimBox-aware pipeline (`pdf_ops._resolve_trim_box`, `crop-rasterize`, `LooseSheetsPreview` trim-clip, imposition) already does the right thing — it's how a single-page flyer with crops works correctly today.

## Fix

In `src/lib/trimPdfPages.ts`, after `copyPages` but before `addPage`, copy each declared box from the source page onto the copied page using pdf-lib's setters.

```text
for each kept page index i:
  source = sourcePdf.getPage(i)
  dest   = copied[i]
  for box in (TrimBox, BleedBox, CropBox, ArtBox):
    rect = source.getBoxOrUndefined?.(box) ?? read from source.node
    if rect: dest.setBox(box, x, y, width, height)
  out.addPage(dest)
```

pdf-lib exposes `page.getTrimBox()`, `getBleedBox()`, `getCropBox()`, `getArtBox()` (each returns `{x,y,width,height}` or throws/returns the MediaBox fallback) and matching `setTrimBox(x,y,w,h)` etc. To avoid stamping a fake TrimBox when the source didn't declare one, read the raw box from the source page dictionary (`source.node.lookup(PDFName.of("TrimBox"))`) and only call `setTrimBox` when the entry is actually present — otherwise we'd promote MediaBox to TrimBox and lose the "no explicit trim" signal.

No changes needed to the PDF server, edge functions, preview components, or the flyer handler — once the trimmed file carries its boxes, the existing `inspectExistingAsset` → `explicitTrim` → `renderBox = TrimBox` path takes over automatically.

## Verification

1. Re-upload the same 8-page A5 flyer with crop marks.
2. Pick "Double-sided flyer".
3. Confirm:
   - `documents.preflight_data.boxes` after reprocess now contains a TrimBox distinct from the MediaBox.
   - Loose-sheet preview no longer shows crop marks (matches the single-page-with-crops behaviour today).
   - Job ticket / imposed sheet from `production-pdf` still places trim correctly (uses the same TrimBox the customer's file now advertises).

## Out of scope

- Changes to `pdf_ops.py`, `crop-rasterize`, imposition, or the preview clipper — they're already correct.
- The `handleFlyerSingleSided` / `handleFlyerDoubleSided` handlers themselves — same fix in `trimPdfPages.ts` covers both.
- Re-checking other products' multi-page trim flows beyond confirming they all funnel through `trimDocumentToFirstPages`.
