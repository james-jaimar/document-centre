# VPS preview pipeline hardening

## Why the page went missing

In `pdf-server/app/tasks/document_tasks.py::generate_previews`:

1. Pages 2..N are rendered + uploaded inside a `ThreadPoolExecutor`.
2. If any one page hits a transient Ghostscript glitch, a worker SIGTERM mid-batch, or an S3 PUT failure, the future raises — **but `fut.result()` is called without a try/except inside the loop**.
3. Even when results return cleanly, the code never **verifies that one preview + one thumbnail exists for every page index 1..page_count**.
4. The job is then marked `done` with `pages_rendered = max(1, page_count)` (a pure assertion, not a measurement). The asset is flipped to `status=ready`.
5. The frontend trusts it, so an index-stable thumbnail array ends up with a hole at index 1 → the "missing page 2" the user saw.

So the fix is server-side: **the VPS must never declare success unless every page has both a `preview_page` and a `thumbnail_page` derived file recorded.**

## Goals

- Treat the expected page count as a **contract**: render N, upload N, persist N, or fail.
- Make the rasteriser, the uploader, and the DB-recorder each retryable on their own.
- Expose a cheap, surgical "re-render just these pages" endpoint so the frontend (next iteration) can self-heal without re-uploading.
- Surface honest progress + per-page errors in `job_events` so admins can see *which* page hiccuped.

## Server changes

### 1. `pdf_ops.rasterize_preview` — completeness check
- After Ghostscript exits, glob the output dir and confirm we got exactly `(last_page - first_page + 1)` files with the expected page-NNN suffixes.
- If any are missing, **retry the missing pages individually** (one Ghostscript call per page is reliable and fast) up to 3 times with a small backoff.
- If still missing, raise `RasterizationIncompleteError(missing_pages=[...])`.

### 2. `generate_previews` task — verify-before-success
Inside `pdf-server/app/tasks/document_tasks.py`:

- Track `expected_pages = set(range(1, page_count + 1))` and `completed_pages: set[int]`.
- Wrap each `_full_page_pipeline` call (rasterize → downscale → upload preview → upload thumbnail → record both rows) in a per-page `try/except` with up to **3 retries** and exponential backoff (250ms / 750ms / 2s + jitter).
- Each retry re-runs only the failed step (rasterize OR upload OR DB write) using small helper subroutines, so we don't redo the whole page if only the S3 PUT blipped.
- After the parallel pool drains:
  - Compute `missing = expected_pages - completed_pages`.
  - If `missing` is non-empty, run a **sequential salvage pass** for those exact page numbers (rasterise just those pages, upload, record).
  - If anything is still missing, mark the job `failed` with `metadata.missing_pages=[…]` and a clear error message — **do not** flip the asset to `status=ready`.
- Only when `len(completed_pages) == page_count` do we:
  - update asset `status='ready'`,
  - call `job_repo.mark_done` with the **measured** count (`pages_rendered=len(completed_pages)`),
  - emit the final `job_event`.

### 3. `_record_preview` — idempotent writes
- Before inserting a new `derived_files` row, check if a row already exists for `(asset_id, kind, page)`. If yes, update it instead of inserting (so a salvage retry doesn't duplicate rows or violate uniqueness).
- Add a unique index migration recommendation in a code comment for the next migration pass: `(asset_id, kind, page)` for `kind IN ('preview_page','thumbnail_page')`.

### 4. Per-page job_events
- Emit a `stage='page_failed'` event with `metadata={'page': N, 'attempt': K, 'error': str(exc)}` whenever a per-page retry fires, so admins can see flapping pages in the live ops feed.
- Emit `stage='salvage'` event when the sequential salvage pass starts, listing missing pages.

### 5. New endpoint: `POST /v1/assets/{asset_id}/render-pages`
Add to `pdf-server/app/web/routes.py`:

- Body: `{ "pages": [int, ...] | "missing" }` — explicit list, or sentinel `"missing"` meaning "scan derived_files and re-render anything not present".
- Behaviour:
  - Compute the actual missing set (from `derived_files` vs `asset.page_count`).
  - Enqueue a new lightweight task `render_specific_pages(asset_id, job_id, pages)` (in `document_tasks.py`) that uses the same per-page pipeline with retries — but only for the given page numbers.
  - Returns `{ job_id, missing_pages }`.
- Allow it for any asset already in `status='ready'` or `status='normalized'`.

This endpoint is what the frontend will call in the next iteration when it detects a gap, instead of having to re-upload the whole file.

### 6. Inspection sanity check
- In `normalize_asset`, after `pdf_ops.inspect()`, log a single `INFO` line: `"normalize_asset: asset=… expected_pages=N source_bytes=…"`. Cheap to grep.
- In `generate_previews` start, log: `"generate_previews: asset=… expected_pages=N dpi=…"`.
- At the end (success or fail), log `"generate_previews: asset=… rendered=K/N missing=[…]"`.

### 7. Config tunables
Add to `app/core/config.py` (no env changes required, sensible defaults):
- `preview_page_max_retries: int = 3`
- `preview_page_retry_base_ms: int = 250`
- `preview_salvage_enabled: bool = True`

## Out of scope (deferred to the next round, per user)

- Frontend gap-detection / auto-call to `/render-pages`.
- UI badge for partially-rendered documents.
- Defensive "page didn't render" placeholder in `FlipBook`.

The user explicitly asked to **fix the server first**, then deal with the frontend. After this VPS work ships, the frontend will only need to (a) trust `pages_rendered`, and (b) call the new `render-pages` endpoint if it ever still detects a hole.

## Files touched

- `pdf-server/app/services/pdf_ops.py` — completeness check + per-page retry in `rasterize_preview`.
- `pdf-server/app/tasks/document_tasks.py` — verify-before-success in `generate_previews`, idempotent `_record_preview`, new `render_specific_pages` task, structured logging.
- `pdf-server/app/web/routes.py` — new `POST /v1/assets/{asset_id}/render-pages`.
- `pdf-server/app/core/config.py` — three new tunables.

## Acceptance

- Uploading the user's `18pp_A4_Landscape.pdf` produces 18 preview rows + 18 thumbnail rows. No holes.
- Killing one Ghostscript subprocess mid-render (simulated fault) produces a `page_failed` event, then a `salvage` event, then a clean `done`.
- Killing all retries for one page produces a `failed` job with `missing_pages=[N]` — and the asset stays at `status='normalized'`, never `'ready'`.
- Calling `POST /v1/assets/{id}/render-pages` with `{"pages":"missing"}` re-renders only the gaps and flips the asset back to `'ready'`.
