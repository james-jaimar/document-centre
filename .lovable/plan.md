
# Optimise the upload pipeline: cut ~16s from an 8-page upload

Two changes, both on the documented "single download per asset" path. Combined they should turn the same 8pp / 18MB A4 from ~36s to ~20s.

## What changes

### 1. Server-side chain: `prepare_for_product` → `generate_previews`

Mirror the pattern already in place for `print_ready`. The `prepare_for_product` worker enqueues `generate_previews` itself the moment the prepared PDF is written and committed to `normalized_storage_path`. The client polls only the downstream preview job, eliminating the ~2s polling gap and the `GET /assets/{id}` round-trip the client currently does between the two operations.

### 2. Shared local-disk handoff between heavy and light workers

Workers co-locate on the same 4 vCPU / 16 GB host. After `prepare_for_product` uploads the prepared PDF to S3, it also copies the file to a shared cache directory (default `/var/cache/document-centre/pdf-cache`) keyed by the storage path. `generate_previews` checks that cache first and only falls back to S3 if the file is missing or stale. That removes the third S3 download of the same PDF in the common case.

Idempotency, retries, and crash-recovery all keep working — S3 remains the source of truth, the cache is advisory.

## Files to edit

**Backend (`pdf-server/`)**
- `app/core/config.py` — add `pdf_cache_dir` (default `/var/cache/document-centre/pdf-cache`), `pdf_cache_enabled` (default `true`), `pdf_cache_max_age_seconds` (default `1800`).
- `app/services/files.py` — add helpers: `cache_put(storage_path, local_path)`, `cache_get(storage_path) -> Path | None`, with atomic writes (`.tmp` + rename), mtime-based TTL, best-effort errors.
- `app/tasks/operation_tasks.py` — modify `_download_asset_pdf` to consult the cache first; modify `prepare_for_product` to `cache_put` the prepared output after the S3 upload succeeds; add `_maybe_chain_generate_previews(...)` call (already exists for `print_ready`, reuse the same helper) and the `chain_*` parameters to `prepare_for_product`.
- `app/schemas/assets.py` — add `chain_generate_previews`, `chain_render_box` to `PrepareForProductRequest`.
- `app/web/routes.py` — `op_prepare_for_product` pre-allocates the preview job row when chaining is requested and returns `{ job_id, preview_job_id }`, matching the `print_ready` shape.
- `app/tasks/ops_tasks.py` — extend the daily `cleanup_tmp` beat job to also prune entries in `pdf_cache_dir` older than the TTL.
- `deploy/systemd/document-centre-worker-heavy.service` & `…-light.service` — add `ReadWritePaths=/var/cache/document-centre` and ensure the directory is created at install time (`scripts/install-api-service.sh`).

**Frontend (`src/`)**
- `src/lib/documentCentreApi.ts` — extend `prepareForProduct` options with `chainGeneratePreviews` and `chainRenderBox`; update the return type to `{ job_id, preview_job_id }`.
- `src/hooks/useDocumentUpload.ts` — pass `chainGeneratePreviews: true` (and the `chainRenderBox` we already derive lower in the pipeline) on the existing `prepareForProduct` call, then poll the returned `preview_job_id` directly instead of dispatching a separate `generate-previews` request afterwards. Skip the intermediate `GET /assets/{id}` that currently happens between the two steps.

## Technical details

**Cache contract**
- Key = the asset's storage path (the same string we use as the S3 key) — guarantees uniqueness across tenants without leaking IDs.
- Layout = `<pdf_cache_dir>/<sha1(storage_path)[:2]>/<sha1(storage_path)>.pdf` to avoid huge flat dirs.
- Write = stream to `<file>.tmp.<pid>` then `os.replace` — partial writes never visible.
- Read = `stat().st_mtime` checked against TTL; on miss or stale entry, fall through to `storage.download`.
- All cache operations swallow exceptions and log a warning — S3 path is always the fallback, never a hard failure.

**Why a shared tmpfs isn't required**
The systemd units already run on the same host. A plain dir on the local SSD is enough; tmpfs is a later optimisation if disk IO ever shows up in profiling. Using disk (not tmpfs) keeps the cache survivable across worker restarts within the TTL window, which is what we want for the chain.

**Chain ordering guarantees**
`prepare_for_product` calls `cache_put` AFTER `storage.upload` and AFTER `asset_repo.update_asset` (so `normalized_storage_path` is committed). Only then does it dispatch the preview task. The preview task downloads from `normalized_storage_path`, which is what it already does — the cache is transparent. If the cache entry vanishes between writer and reader, the worker downloads from S3 as today.

**Idempotency**
- `prepare_for_product` already has a signature-based skip path. When skipped, it returns without writing the cache — that's fine because either (a) a previous run populated it, or (b) it expired and the next preview job will pull from S3.
- The chained `generate_previews` job row is pre-allocated by the route, so the client can start polling immediately even if the chain enqueue races.

**Rollback / kill-switch**
`PDF_CACHE_ENABLED=false` disables the cache entirely (workers always download from S3).
Not passing `chainGeneratePreviews` from the client falls back to the existing two-call flow.

## Expected impact

For the 8pp / 18MB A4 just tested:
- Save ~2s — eliminate the prepare→previews polling gap and `GET /assets` round-trip (server-side chain).
- Save ~10-14s — eliminate the 3rd S3 download (18MB pull from the light worker disappears).
- New total ≈ 20s instead of 36s.

For larger documents the savings scale with PDF size (each skipped download is one full S3 GET).

## Out of scope

- Removing the inline pikepdf probe's S3 download — that's already the only authoritative read inside the API process and changing it would couple the API to the workers' filesystem.
- Migrating the heavy worker to share a real tmpfs ramdisk — defer until disk IO is shown to matter.
- The earlier "raise fanout threshold" decision — already shipped (`render_batch_threshold=200`).
