# Fix booklet preview aspect-ratio mismatch — verified plan

## Box-reading audit result (re-check)

The full trim/bleed/media pipeline reads your file **correctly**:

- Python preflight (`pdf_ops.py:647`) captures all five boxes per page into `asset.boxes`.
- `useDocumentUpload.ts:820–876` writes `page_width_mm/page_height_mm` from the **TrimBox** (so 148 × 210 mm for your file, not the 162.8 × 224.8 MediaBox) and stores `preflight_data.trim_box_pt` + `preflight_data.boxes` whenever TrimBox ≠ MediaBox by > 0.5 pt — your 7.408 mm bleed clears that easily.
- `PreviewPanel.tsx:679–752` correctly resolves the TrimBox (in points), computes `pageAspectRatio = 0.7048`, and computes `trimCrop ≈ { left: 0.0455, top: 0.0329, width: 0.9091, height: 0.9341 }` against the MediaBox.

So nothing is wrong with how we read the PDF boxes.

## Root cause (confirmed)

Two co-existing problems in the booklet preview only:

1. **`DocumentPreview.tsx:182–213`** — the `commonProps` object passed to `<FlipBook />` does not include `trimCrop` (it is only forwarded to `<LooseSheetsPreview />` at line 218/230).
2. **`FlipBook.tsx:415–436`** — `FlipBook` doesn't destructure or use `trimCrop` even though `FlipBookProps` declares it (`previewTypes.ts:85`). So the wiring was stubbed out but never finished.

Server-side thumbnails are *normally* pre-cropped to TrimBox by `derive_default_render_box` (`document_tasks.py:244`), which is why this matched up by luck before. Any thumbnail that escaped that crop — old uploads, the freshly-scaled A4/Letter pages, or any code path where TrimBox cropping was skipped — lands in FlipBook at MediaBox ratio (0.7141) inside a TrimBox-shaped container (0.7048) and gets letterboxed by `object-contain`. That's the bands you're seeing.

## The fix

### 1. `src/components/preview/DocumentPreview.tsx`
Add `trimCrop` to `commonProps` (or pass it explicitly to FlipBook the same way it's passed to LooseSheetsPreview today).

### 2. `src/components/preview/FlipBook.tsx`
Destructure `trimCrop?: { left; top; width; height }` and forward it to each page renderer.

### 3. Page image rendering inside FlipBook (lines 73–79)
When `trimCrop` is present, render the `<img>` using the same crop technique as `LooseSheetsPreview`:
- wrapper at the page-slot size with `overflow: hidden`
- inner `<img>` scaled by `1/trimCrop.width` × `1/trimCrop.height`, translated by `-trimCrop.left` × `-trimCrop.top` (as fractions of slot size)

This way:
- Pre-cropped thumbs (the normal path) get a near-identity crop (the guard at PreviewPanel:749 already skips `trimCrop` entirely when MediaBox − TrimBox < 1 mm, so this is a no-op for them).
- Non-pre-cropped thumbs (older uploads, edge cases) finally render edge-to-edge.

### 4. Nothing else changes
- No change to box-reading, preflight, scaling, or rasterisation.
- No change to `pageAspectRatio` (TrimBox ratio is the correct page-slot ratio).
- No change to `PageEffects` `allowBleed` dead code.
- No change to the auto-scale-to-A5 prompt or its `fitMode: "fit"` behaviour.

## Verification

1. Reload the booklet preview for the existing job — original 28 A5+bleed pages should now reach top/bottom edges of the spread.
2. Re-upload the same file fresh — should match.
3. The auto-scaled A4 page and US-Letter back cover should remain unchanged (they have no bleed → `trimCrop` no-op).
4. Page flip, numbering, cover/inside detection, spread parity, finishing effects: unchanged.

## Out of scope

- Re-rasterising historical thumbnails to TrimBox.
- Cleaning up `PageEffects.allowBleed` / `bleedInsetPx` dead code.
- Any change to the size-detection / scale-to-target prompt.
