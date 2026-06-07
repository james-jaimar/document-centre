## What's actually wrong

Your 17 MB / 8-page PDF is image-heavy (~2 MB/page of embedded raster). The current preview pipeline is tuned for vector/text PDFs, and on image-heavy input it fails in two compounding ways:

### 1. The batch timeout is way too tight

`rasterize_pages_mutool` computes its timeout as:

```
timeout = min(180s, 10s + 2s × page_count)
```

For 8 pages that's **26 seconds total** for the whole batch. An image-heavy A4 page at 150 DPI through MuPDF's full painter can easily take 5–15s/page on Cloud Run vCPUs. So `mutool draw` is killed mid-render → `MutoolRenderError` → the "5 of 8 missing" you saw.

### 2. The "surgical retry" is serial and also tight

After the batch fails, missing pages are retried **one at a time**, each with a 30s timeout. On a 4 vCPU light worker that means 3 cores sit idle while one page renders, and if any individual page is genuinely slow it dies again. Five missing pages × ~30s each = wall-clock minutes, then the salvage path runs too.

### 3. Banded threading (`-B 256 -T 4`) doesn't help here

`-B/-T` parallelises bands **within** a single page. When a page is essentially one full-page JPEG XObject, MuPDF has to decode that JPEG once before it can band anything — bands don't speed up image decode. So the "4 vCPUs all used" assumption from the comment doesn't hold for this file type.

### Why Adobe Acrobat took 7 seconds

Acrobat detects pages that are a single image and pipes the embedded image straight to the encoder at near-native resolution. It never runs a full page painter. We can do the same trick with `pikepdf` + Pillow.

---

## The plan

### A. Raise the mutool timeouts (one-line fix, ships the cliff)

In `pdf-server/app/services/pdf_ops.py` `rasterize_pages_mutool`:

```python
if timeout_seconds is None:
    # Image-heavy A4 pages can take 10–15s each on Cloud Run vCPUs.
    # Old budget (10 + 2*N capped 180) killed batches before they could
    # finish on raster-heavy PDFs and forced the per-page retry path.
    timeout_seconds = min(600.0, 60.0 + 15.0 * page_count)
```

And bump the per-page retry default in `rasterize_one_page_mutool` from `30.0` → `90.0`. Cloud Run task timeout is already 900s, so 600s + retries fits comfortably.

### B. Run the per-page retry in parallel, not serially

In `document_tasks.py` `generate_previews`, replace the `for page_num in exc.missing_pages: rasterize_one_page_mutool(...)` loop with a `ThreadPoolExecutor(max_workers=settings.render_cpu_concurrency)` so up to 4 single-page `mutool draw` processes run concurrently on the light worker's 4 vCPUs. Each subprocess pins one core — true CPU parallelism, not the band-level pseudo-parallelism.

### C. Single-image-page fast path (the real win for files like this)

New helper in `pdf_ops.py`:

```python
def extract_single_image_page(src: Path, page: int, out: Path,
                              target_long_edge_px: int) -> bool:
    """If page `page` is essentially one image XObject covering the page,
    extract that image with pikepdf, downscale with Pillow, write JPEG
    to `out`, and return True. Otherwise return False so the caller
    falls back to mutool draw."""
```

Heuristic: open the page with pikepdf, count `/XObject` entries of `/Subtype /Image`; if exactly one image whose pixel area covers > 95% of the MediaBox area and the page has no significant text/vector content, take the fast path. Otherwise return False.

Then in `generate_previews` **before** calling `rasterize_pages_mutool`, try the fast path per page in a thread pool, and only feed pages that returned False into the mutool batch. For the user's file every page goes through pikepdf+Pillow and never touches MuPDF — should drop from minutes to a few seconds total.

### D. Better forensics in the `mutool_failed` job event

Add to the diagnostic metadata: page size in bytes, image XObject count per missing page, and the per-page elapsed_ms. Today the admin UI says "mutool failed" without telling you whether it was a timeout, an OOM, or a malformed page. After this you'll see "page 3 timed out at 26.0s / 3 image XObjects / 12 MB" at a glance.

### E. (Optional, behind a flag) Drop banded threading on this build

`-B/-T` is probed and used, but for image-heavy PDFs it's wasted complexity. Add `MUTOOL_USE_BANDED_THREADING=false` env var (default: keep current behaviour) so we can A/B test turning it off entirely and instead just running N parallel single-page subprocesses — simpler code path, identical or better throughput on raster-heavy work.

---

## Files touched

- `pdf-server/app/services/pdf_ops.py` — timeout formula, `extract_single_image_page` helper, per-page retry timeout default.
- `pdf-server/app/tasks/document_tasks.py` — fast-path attempt before batch, parallel per-page retry pool, richer `mutool_failed` event metadata.
- `pdf-server/app/core/config.py` — optional `MUTOOL_USE_BANDED_THREADING` flag (default true to stay safe).
- `pdf-server/scripts/smoke-test-mutool-render.sh` — add an 8-page image-heavy variant so this regression is caught on the VPS smoke test next time.

No Cloud Run config or workflow changes needed — the existing `--cpu=4 --memory=4Gi --timeout=900` headroom is fine; we're just using it properly.

---

## Expected outcome on your 8-page / 17 MB file

- Single-image fast path triggers on all 8 pages → ~1s/page sequential, ~0.5s/page with the thread pool → **under 5s end-to-end**, comparable to Acrobat.
- If the fast path doesn't trigger (mixed text + images), batch mutool now has 180s budget for 8 pages instead of 26s → finishes cleanly, no per-page retries, no missing pages.
- If a batch still fails, retries run 4-up in parallel on the 4 vCPU light worker instead of 1-up, so worst-case wall clock drops ~4×.
- `mutool_failed` events become actually useful for diagnosis.

Want me to implement this exact plan?
