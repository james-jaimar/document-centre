## Plan: fix bleed/crop resize on the VPS PDF server

### Confirmed root cause (verified in `pdf-server/app/services/pdf_ops.py`)

`prepare_for_product` runs in this order:

```text
src → to_print_ready_cmyk (Ghostscript pdfwrite) → normalize_orientation → resize_pages
```

`to_print_ready_cmyk` invokes Ghostscript `pdfwrite` with no flags to retain `/TrimBox`, `/BleedBox`, or `/ArtBox`. Ghostscript's default behaviour is to drop those boxes and emit only MediaBox (+ CropBox). By the time `resize_pages` runs with `respect_trim_box=True`, the TrimBox no longer exists, so the "bleed-aware" branch is never taken and the whole MediaBox (page + bleed + crop marks) gets scaled into the target size — exactly the distortion you're seeing.

The `respect_trim_box=True` branch in `resize_pages` (lines ~1558–1641) is correct; it just never runs because the box it depends on has been stripped upstream.

### Fix (single file: `pdf-server/app/services/pdf_ops.py`)

1. **Snapshot page boxes before CMYK** in `prepare_for_product`:
   - Before calling `to_print_ready_cmyk`, open `src` with pikepdf and capture per-page `/MediaBox`, `/CropBox`, `/TrimBox`, `/BleedBox`, `/ArtBox`, and `/Rotate`.

2. **Re-stamp boxes onto the CMYK output** immediately after Ghostscript succeeds:
   - Open `cmyk_out` with pikepdf, and for each page write back any of the four content boxes (`CropBox`, `TrimBox`, `BleedBox`, `ArtBox`) that existed on the corresponding source page. Leave MediaBox alone unless the source had a smaller CropBox that we need to honour.
   - Save in place. This restores the trim/bleed geometry Ghostscript stripped.

3. **No pipeline reorder, no orientation changes.**
   - Orientation and resize already work on the box-restored PDF, so the existing `respect_trim_box` branch in `resize_pages` finally has real data to work with and will:
     - fit content to the TrimBox-derived trim size,
     - keep crop marks outside the new BleedBox (so they're clipped, not scaled into the artwork).

4. **Safety / fallback:**
   - Wrap the re-stamp step in try/except and log a warning on failure — never block a job. Worst case we fall back to today's behaviour.
   - If page count changed (shouldn't, but defensive), skip the re-stamp.

### Files affected

- `pdf-server/app/services/pdf_ops.py` — add a small helper (`_snapshot_page_boxes`, `_restore_page_boxes`) and call them around the `to_print_ready_cmyk` step inside `prepare_for_product`.

No changes to:
- `resize_pages` (already correct).
- `normalize_orientation`.
- Celery tasks, routes, schemas, frontend, edge functions, database.

### Validation (on the VPS after `git pull`)

Re-run an asset that has real bleed + crop marks through `prepare_for_product` and inspect the intermediate PDFs with `pikepdf`/`pdfinfo`:

```text
src                 → MediaBox > TrimBox (bleed present), crop marks present
after CMYK + stamp  → MediaBox > TrimBox preserved (the fix)
after orient        → boxes preserved by existing normalize_orientation stamp pass
after resize        → new MediaBox = product size + bleed, TrimBox = product size,
                      crop marks clipped, artwork not squashed
```

If you can drop a failing sample PDF into the chat (or its asset id), I can additionally tailor the regression check to it; otherwise the synthetic check above is enough to verify the deployed fix.
