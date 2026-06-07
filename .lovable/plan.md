# Preview rendering — Ghostscript-first pipeline

## Why this exists

A real customer PDF (8 pages, 17 MB, A4, Illustrator export with CMYK
images + transparency + masks) was taking minutes to thumbnail and
silently dropping pages. The same file renders in ~3.5s with one
`gs -sDEVICE=jpeg` invocation on plain Linux.

Root cause was the previous pipeline:

1. `pikepdf` per-page scan ("single-image fast path")
2. `mutool draw` batch with `-B/-T` banded threading
3. Per-page `mutool draw` retry pool
4. Page-1 fallback
5. In-process or fan-out per-page render
6. Salvage pass

MuPDF's painter stalls on transparency groups, and we were always going
PDF → PNG → Pillow → JPEG. Both problems disappear when Ghostscript
writes JPEGs directly.

## What's in place now

- `pdf_ops.rasterize_pages_ghostscript_jpeg(src, prefix, dpi, first, last, quality)`
  - One `gs -q -dSAFER -dBATCH -dNOPAUSE -dNumRenderingThreads=4
    -sDEVICE=jpeg -dJPEGQ={q} -r{dpi} -dFirstPage -dLastPage
    -sOutputFile=...-%03d.jpg` call.
  - Renames sequential output indices → source page numbers.
  - Raises `RasterizationIncompleteError` with the exact missing pages.
- `pdf_ops.rasterize_one_page_ghostscript_jpeg` for parallel single-page
  retries.
- `settings.preview_renderer` (`PREVIEW_RENDERER`, default
  `ghostscript`; alternative `mutool` for A/B).
- `settings.preview_jpeg_quality` default lowered to **85** (Acrobat-ish
  quality, smaller files, faster encode).
- `generate_previews` batch block rewritten:
  1. One `gs` batch call for pages 1..N.
  2. Parallel single-page `gs` retry for any missing pages.
  3. Per-page `mutool draw` last-resort salvage.
  4. Downscale + upload + DB-record concurrently.
- `_rasterize_one_page_best_effort` (used by salvage + render_one_page
  fan-out) tries gs JPEG → mutool JPEG → gs PNG in that order.
- `extract_single_image_page` left in `pdf_ops.py` but no longer called
  from the hot path.
- `scripts/smoke-test-ghostscript-render.sh` — fails if 8 A4 pages at
  150 DPI take > 15s locally.

## Targets on the light Cloud Run worker (4 vCPU, 4 GiB)

For the user's 8 page / 17 MB / A4 brochure:

| Stage              | Target |
|--------------------|--------|
| S3 download        | 1–2s   |
| `gs` render 8pp    | 3–5s   |
| Upload + DB write  | 2–4s parallel |
| **End-to-end**     | **under 12s** |

The `render_incomplete` job event now carries `engine`, `missing_pages`,
`gs_retry` and `mutool_salvage` so the admin UI tells the truth instead
of just "mutool failed".

## What we deliberately did NOT change

- No Docker image / Cloud Run shape / queue backend change.
- No touch to imposition / preflight / grayscale code paths.
- `mutool` stays in the image — used as the last-resort per-page salvage
  and by other code paths.
- `render_specific_pages` (the surgical "re-render these N pages"
  endpoint) is still mutool-batch; that can be migrated in a follow-up
  once the primary path is proven on the worker.

## If it still feels slow after deploy

The `render_batch_gs` / `render_gs_retry` / `render_mutool_salvage`
stamps in `job_events.metadata.timings_ms` will name the bottleneck
directly. If `render_batch_gs` is fast and total wall-clock is high,
the problem is uploads or DB, not the renderer.
