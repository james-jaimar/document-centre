# VPS preview pipeline hardening — SHIPPED

The VPS now treats the page count as a hard contract. The asset is only
flipped to ``status='ready'`` when every page from 1..page_count has both
a ``preview_page`` and a ``thumbnail_page`` derived file recorded.

## What changed (server-side, `pdf-server/`)

### `app/services/pdf_ops.py`
- New `RasterizationIncompleteError` exception.
- `rasterize_preview` now does a completeness check after the bulk
  Ghostscript run: if any expected pages are missing, it re-renders them
  one at a time (single-page GS calls are extremely reliable) up to
  `settings.preview_page_max_retries` attempts with exponential backoff +
  jitter, then raises `RasterizationIncompleteError` if anything is still
  missing.
- Internal helper `_gs_rasterize_pages` does the raw subprocess call so
  the verify/retry logic lives in one place.

### `app/services/derived_files.py`
- `create_file` is now idempotent for `preview_page` / `thumbnail_page`
  rows keyed on `(asset_id, kind, page)` — salvage and re-render passes
  update in place instead of duplicating rows.
- New helper `pages_present(db, asset_id, kind)` returns the set of page
  numbers that already have a derived file of the given kind. Used by
  the `/render-pages` endpoint to compute "missing".
- A migration to add a unique partial index on
  `(asset_id, kind, page) WHERE kind IN (...) AND page IS NOT NULL` is
  noted in a comment at the top of the module.

### `app/tasks/document_tasks.py`
- New shared helpers `_retry_with_backoff`, `_render_one_page`, and
  `_record_page` — each step (rasterize / downscale / upload / DB
  record) retries independently so a transient S3 hiccup never forces a
  full re-rasterize.
- `generate_previews` rewritten to:
  1. Track `expected_pages` and `completed_pages` as sets.
  2. Page-1 fast path uses `_render_one_page` + `_record_page` (with
     retries).
  3. Parallel pool processes pages 2..N. Per-page failures are caught
     and logged as `stage='page_failed'` events but do NOT crash the
     job — they go into the salvage set.
  4. After the pool drains, a sequential salvage pass re-tries any page
     still missing (with a `stage='salvage'` event listing the gaps).
  5. Final verify: if `still_missing` is non-empty, the job is marked
     **failed** with `metadata.missing_pages=[…]` and the asset is NOT
     promoted to `status='ready'`. The frontend can recover via the new
     `/render-pages` endpoint.
- New `render_specific_pages` Celery task: same per-page pipeline, but
  for an explicit page list. Promotes the asset back to `'ready'` once
  every page has both rows present.
- INFO logs for `expected_pages` / `rendered/expected/missing` at the
  start and end of every preview job.

### `app/web/routes.py` + `app/schemas/assets.py`
- New `RenderPagesRequest` schema.
- New endpoint `POST /v1/assets/{asset_id}/render-pages`. Body:
  - `{"pages": [2, 7, 11]}` — explicit page numbers, or
  - `{"pages": "missing"}` — auto-detect gaps from `derived_files` and
    re-render whatever is missing.
  - Returns `{ job_id, missing_pages }`.

### `app/core/config.py`
- New tunables: `PREVIEW_PAGE_MAX_RETRIES` (default 3),
  `PREVIEW_PAGE_RETRY_BASE_MS` (default 250),
  `PREVIEW_SALVAGE_ENABLED` (default true).

## What this fixes

The 18-page document with a missing page-2 thumbnail: in the old code,
if page-2 hit a transient Ghostscript glitch or a worker SIGTERM
mid-batch, the future would raise inside `as_completed` without being
caught, the loop would silently drop that page, and the job would still
be marked `done` with `pages_rendered = max(1, page_count)` (a pure
assertion, not a measurement). The asset flipped to `status='ready'`,
the frontend trusted it, and the index-stable thumbnail array got a hole
at index 1 — that's the "missing page 2" the user saw.

After this change, that path will:
1. Catch the per-page failure and emit a `page_failed` job event.
2. Run the salvage pass on page-2 (single-page GS calls are reliable).
3. If salvage also fails, mark the job FAILED with
   `missing_pages=[2]` and leave the asset at its prior status — never
   silently "done".

## Out of scope (next iteration)

- Frontend gap-detection / auto-call to `/render-pages`.
- "Re-render" badge in the document card if gaps remain.
- "Page didn't render" placeholder in `FlipBook` instead of a blank
  white sheet.

The user explicitly asked to fix the server first and then deal with
the frontend. The frontend layer can now trust `pages_rendered` and use
the new `/render-pages` endpoint when it ever still detects a hole.
