## Goal

Match the 3–5 second Ghostscript benchmark on Cloud Run for an 8-page A4 PDF. Stop using MuPDF as the primary JPEG renderer. Remove the branching maze that's making image-heavy, Illustrator-style PDFs crawl.

## What changes (high level)

1. **Ghostscript becomes the default preview renderer**, going PDF → JPEG in one step (no PNG intermediate, no Pillow re-encode).
2. **Remove the MuPDF fast path and single-image extraction heuristics** from the hot path. They were added to dodge MuPDF's slowness; we're removing the cause, so they're dead weight.
3. **Keep MuPDF only as a named fallback** behind a feature flag, used only if Ghostscript fails to produce a page.
4. **Parallelism**: render the whole page range in one `gs` invocation (it's already fast); drop the per-page thread fan-out for the batch path. Keep the parallel pool only for the salvage retry.
5. **Add a strict wall-clock budget + telemetry** so we can see exactly where the seconds go: download, render, upload, DB.
6. **Document the new contract** and add a smoke test that fails if 8 pages at 150 DPI takes longer than ~15s end-to-end on Cloud Run.

## Files touched

- `pdf-server/app/services/pdf_ops.py`
  - New `rasterize_pages_ghostscript(src, out_pattern, dpi, first, last, quality)` → uses `gs -sDEVICE=jpeg -dJPEGQ=85 -r{dpi} -sOutputFile=page-%03d.jpg`.
  - Keep existing `rasterize_pages_mutool` but mark it fallback-only.
  - Quarantine `extract_single_image_page` from the hot path (kept in file, no longer called by `generate_previews`).
- `pdf-server/app/tasks/document_tasks.py` `generate_previews`
  - Replace the fast-path scan + mutool batch + parallel per-page retry block with:
    1. one `rasterize_pages_ghostscript` call for pages 1..N,
    2. detect missing pages, retry those in parallel with Ghostscript single-page commands,
    3. only if still missing, try MuPDF as a last-resort salvage.
  - Emit per-stage timings (`download_ms`, `render_ms`, `upload_ms`, `db_ms`) on the `generate_previews` job event so the admin UI shows where the time goes.
- `pdf-server/app/core/config.py`
  - New `preview_renderer: Literal["ghostscript", "mutool"] = "ghostscript"`.
  - Keep `preview_dpi=150`, `preview_jpeg_quality=85`.
- `pdf-server/scripts/`
  - Add `smoke-test-ghostscript-render.sh`: asserts 8 A4 pages render to JPEG at 150 DPI in under 10s wall-clock locally.
- `.lovable/plan.md`
  - Replace existing MuPDF-tuning plan with this Ghostscript-first plan so it doesn't keep guiding future changes the wrong way.

## Why this is the right shape

- Your PDF is a designed Illustrator file with transparency, masks and CMYK images. MuPDF's `draw` slows down dramatically on transparency groups; Ghostscript handles them via its mature transparency compositor in a single C pass.
- Going PDF → JPEG directly skips a PNG decode + JPEG encode round-trip per page, which on Cloud Run vCPUs is the difference between 0.4s/page and 4s/page.
- One `gs` invocation per upload already saturates one core efficiently. The previous thread-pool / per-page fan-out only paid off because MuPDF was the bottleneck; with `gs` as the renderer, it just adds process-spawn overhead.

## Expected after the change

For the 17 MB / 8-page file on the light worker (4 vCPU, 4 GiB):

| Stage              | Target |
|--------------------|--------|
| S3 download        | 1–2s   |
| `gs` render 8pp    | 3–5s   |
| Upload + DB write  | 2–4s parallel |
| **End-to-end**     | **under 12s** |

If we still see >30s after this, the bottleneck is no longer the renderer and the telemetry will name it directly (likely S3 upload concurrency or Postgres latency).

## Explicitly NOT doing

- Not changing the worker image, Cloud Run shape, or queue backend.
- Not touching imposition / preflight / grayscale code paths.
- Not removing `mutool` from the Docker image — it stays as a fallback and is still used by other code paths.

## Roll-out

1. Land code + smoke test.
2. Push the worker image, watch one upload of the user's PDF on `/platform/document-centre/workers`, confirm timings.
3. If green, delete the dead fast-path code in a follow-up PR (kept on first pass so we can revert cleanly).
