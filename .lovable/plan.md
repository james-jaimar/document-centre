# Render-first preview pipeline — SHIPPED

## What changed (this PR)

**Root cause (confirmed by production job metadata):** the dispatcher in
`pdf-server/app/tasks/document_tasks.py` was hard-routing every render through
`_generate_previews_sequential`, which interleaved render → thumbnail → upload →
DB write per page inside a single loop. 4 vCPUs sat idle and 8 pages took ~47s
because of per-page S3/DB latency, not Ghostscript.

The pipeline has been rewritten with strict phase separation. **No DB or S3
writes happen inside the render loop in any path.**

### New default: `batch`
```text
1. download source PDF
2. ONE Ghostscript invocation renders all pages to /tmp
3. verify every file locally (Pillow) → in-memory manifest
4. thumbnail every page (ThreadPool, local-only)
5. upload previews+thumbnails in parallel to DETERMINISTIC S3 paths
6. ONE bulk upsert into derived_files (retried on a FRESH session)
7. update asset preview/thumbnail/status + mark job done
```

### Fallback ladder
1. **`batch`** (default) — `_generate_previews_batch`
2. **`parallel`** — `_generate_previews_parallel_local`: ProcessPoolExecutor
   renders pages in parallel **locally**. Workers never touch S3 or the DB.
   Same finalise tail.
3. **`sequential`** — `_generate_previews_sequential` (legacy VPS-style),
   kept ONLY for final safety + emergency rollback via env.

### Env flags
- `PREVIEW_PIPELINE_MODE` = `batch` (default) | `parallel` | `sequential` — force a specific path for testing.
- `PREVIEW_FORCE_SEQUENTIAL=true` — emergency rollback, wins over MODE.
- `PREVIEW_BULK_UPSERT_MAX_RETRIES` / `PREVIEW_BULK_UPSERT_RETRY_BASE_MS` — tune the fresh-session retry.
- `PREVIEW_TMP_SAFETY_FACTOR` — conservative `/tmp` guard. Default 4.0 leaves normal 8-page 150 DPI uploads untouched.

### Deterministic S3 layout (NEW)
Retries overwrite the same key — no orphaned files:
```
{tenant_prefix}assets/{asset_id}/jobs/{job_id}/previews/page-NNN.jpg
{tenant_prefix}assets/{asset_id}/jobs/{job_id}/thumbnails/page-NNN.png
```

### Database
- New migration `pdf-server/migrations/2026_06_08_preview_pipeline.sql` creates
  the unique partial index `derived_files_asset_kind_page_uniq` that the bulk
  upsert relies on. **Apply on Supabase before next deploy** (a Lovable migration
  was attempted but blocked by Supabase permissions in this session).
- Defensive: the worker also runs `CREATE UNIQUE INDEX IF NOT EXISTS` once per
  process at first use, so a missing migration cannot strand uploads.
- `pdf-server/app/db/session.py` already has `prepare_threshold=None` and
  `pool_recycle=1800` from the previous fix — that is what makes the single
  bulk upsert safe under PgBouncer transaction pooling.

### Metadata recorded on every render
Final `job_events.metadata.timings_ms` contains:
`download_pdf_ms`, `prepare_render_box_ms`, `gs_batch_render_ms` (or
`parallel_render_ms`), `verify_ms`, `thumbnail_ms`, `upload_ms`,
`db_bulk_upsert_ms`, `total_ms`, `preview_count`, `thumbnail_count`,
`workspace_bytes_used`, `path_taken`, `tmp_free_bytes`, `tmp_estimated_bytes`.
Plus `runtime` block from `_runtime_meta()` carries `k_revision`,
`k_service`, `cpu_count`, `render_cpu_concurrency`, `render_io_concurrency`,
`preview_gs_threads`, etc.

### Promotion contract (unchanged from previous fix, now enforced in shared tail)
The job is only marked `done` and the asset only promoted to `ready` AFTER:
render ✅ verify ✅ thumbnail ✅ upload ✅ bulk upsert ✅ asset paths updated ✅.
Any earlier failure leaves the asset at its prior status and the modal sees
a clear `failed` job — never partial `derived_files` rows.

## Files changed
- `pdf-server/app/tasks/document_tasks.py` — new batch + parallel-local pipelines, shared finalise tail, dispatcher updated.
- `pdf-server/app/core/config.py` — `preview_pipeline_mode`, `preview_force_sequential`, `/tmp` guard + bulk-upsert retry tunables. Legacy `preview_safe_sequential_enabled` is no longer read by the dispatcher.
- `pdf-server/migrations/2026_06_08_preview_pipeline.sql` — unique partial index.
- `pdf-server/scripts/smoke-test-batch-preview.sh` — end-to-end smoke test.

## Verification
- Python syntax compiles clean for all changed modules.
- After deploying `pdf-worker-light` to Cloud Run:
  1. Re-upload the 8-page A5 PDF that previously took ~47s.
  2. Read `job_events.metadata` for the new job and confirm:
     - `path_taken=batch`
     - `gs_batch_render_ms` ≪ 11s
     - `total_ms` ≪ 15s
     - `preview_count == thumbnail_count == 8`
     - 16 rows in `derived_files` for that asset.
  3. Set `PREVIEW_PIPELINE_MODE=parallel` and repeat — confirm `path_taken=parallel`, same row counts.
  4. Set `PREVIEW_FORCE_SEQUENTIAL=true` and repeat — confirm rollback path still works end-to-end.
