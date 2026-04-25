## Problem

The current Office (Word/PowerPoint/ODT) pipeline runs in this order:

1. Upload original file
2. **Convert** to PDF via LibreOffice on VPS
3. **Inspect** (read boxes + page count)
4. **Normalize orientation** — rotates "non-dominant" pages to match the family's expected orientation. For bound documents this means *every landscape page is rotated to portrait immediately*.
5. **Print-ready** (CMYK)
6. **Inspect dimensions** → detect non-ISO size (e.g. US Letter)
7. **Render** thumbnails
8. *(Later, in OrderFiles)* Show size advisory → user picks "Scale to A4" or "Keep size" → triggers `resize` and re-render

The bug: for an Office file that legitimately mixes orientations (e.g. 2 portrait → 20 landscape → more portrait, like Word's own "Page Setup → This section" feature produces), step 4 destroys the author's intent **before** the user has even seen the size advisory. Word itself, when "Save as PDF" is used, preserves those orientations perfectly. We should mimic that.

## Proposed Order (Office files only)

For Office uploads, reorder to match what Word does natively:

1. Upload original file
2. **Convert** to PDF via LibreOffice (untouched — preserves per-section orientations exactly as the author set them)
3. **Inspect** boxes + page count
4. **Detect size** (Letter / Legal / non-ISO) and surface the size advisory immediately if needed
5. **Wait for user decision** on size:
   - "Scale to A4" → call `resize` on the asset, then re-inspect
   - "Keep size" → continue with original dimensions
6. **Now** run `normalize-orientation` for bound/booklet/brochure/ring-binder families (rotate landscape → portrait so the bound spine works), or for `presentations` (rotate portrait → landscape). Mixed orientation is then a deliberate transform applied to a sized canvas, not a destructive default.
7. **Print-ready** (CMYK)
8. **Render** thumbnails

The standard PDF path is unchanged — those files arrive already sized and oriented by their author.

## Implementation

### 1. `src/hooks/useDocumentUpload.ts`

- Split `inspectExistingAsset` into two halves:
  - **`inspectAndDetectSize`** — runs `inspectAsset` + reads boxes + computes `detectNonIsoSize` / `detectNearIsoWithBleed`. Persists `preflight_data` with `awaiting_review: true` if a size advisory is needed. **Does NOT call `normalize-orientation` or `print-ready`.** Returns `{ asset_id, hasAdvisory, renderBox, hasSizeAdvisory }`.
  - **`finalizeOrientationAndPrintReady`** — runs `normalize-orientation` (when family demands it) + `print-ready`, then re-reads asset boxes and re-persists dimensions. Called either:
    - directly after `inspectAndDetectSize` when `hasSizeAdvisory === false` (current PDF behaviour, no user wait), or
    - from the OrderFiles size-advisory resolver after the user clicks "Scale to A4" or "Keep size".

- For **PDF uploads**: behaviour is unchanged — `inspectAndDetectSize` then `finalizeOrientationAndPrintReady` runs back-to-back, then `renderDocumentThumbnails` (or wait for advisory).

- For **Office uploads**: after `convertOffice` completes, run only `inspectAndDetectSize`. If `hasSizeAdvisory` is true, stop there and let OrderFiles drive the rest. If false, run `finalizeOrientationAndPrintReady` and render normally.

### 2. `src/pages/dashboard/OrderFiles.tsx`

The two existing size-advisory handlers (around lines 325–422) — "Keep size" and "Scale to A4" — currently call `renderWithProgress` directly. Update them to:

1. (Scale path only) call `resize(assetId, targetW, targetH, "fit")` and poll, as today.
2. **New step**: call the new `finalizeOrientationAndPrintReady(docId, assetId, fileName)` exposed from `useDocumentUpload`. This runs `normalize-orientation` + `print-ready` against the now-correctly-sized asset.
3. Then `renderWithProgress` as today.

Expose `finalizeOrientationAndPrintReady` from `useDocumentUpload`'s return value alongside `reprocessDocument`.

### 3. `preflight_data` flag

Add `orientation_normalized: true` to the persisted `preflight_data` once `finalizeOrientationAndPrintReady` completes successfully. This lets `reprocessDocument` and any future re-render skip a redundant rotate pass.

### 4. No VPS changes required

`normalize-orientation`, `resize`, `print-ready`, `inspect`, and `convert` endpoints all already exist on the VPS. This is purely a client-side reordering. No DB migration needed (all state lives in the existing `preflight_data` JSONB column).

## What this fixes

- Office files with intentional mixed orientations (your 2-portrait + 20-landscape + portrait deck) will: be converted → sized to A4 if needed → *then* have orientation normalized only if the product family requires it. For products like flyers/posters that don't normalize at all, the original mixed layout is fully preserved.
- The user always sees the size question against the document Word/LibreOffice produced, not against a pre-rotated derivative.
- No regression for native PDF uploads — they still run the current sequence.

## What this does *not* address

- Overall ~60s end-to-end time for an 8pp A4. That's mostly LibreOffice cold-start + Ghostscript render time on the VPS, not the JS pipeline. If you want to attack that next, the targets are: (a) keep a warm `soffice --headless` worker on the VPS, (b) parallelise `print-ready` and the first `generate_previews` page. Happy to scope that as a separate plan once this reorder lands.
