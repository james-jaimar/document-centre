# Pipeline performance fix plan

The light Cloud Run worker has 4 vCPUs but only **1 uvicorn process**, so every render job runs serially behind the previous one. Combined with a sequential recovery path, an over-eager 90s stall guard, and rasterizing thumbnails at full preview DPI, an 8-page PDF that should finish in ~15–25s often takes 60s+.

Below are the changes in priority order. Each is small and isolated — nothing rewrites the architecture.

## 1. Real parallelism on the light worker (biggest win)

**Problem:** `worker-light-http` starts uvicorn with `--workers ${UVICORN_WORKERS:-1}`. One process handles all render tasks. When two uploads land in the same minute the second one waits for the first to fully finish.

**Change:** In `pdf-server/scripts/entrypoint.sh`, default `UVICORN_WORKERS` to `4` when `ROLE=worker-light-http` (and leave the env override in place so Cloud Run can tune it). Also set Cloud Run service `--concurrency` to 1 per worker process equivalent (already effectively the case via Cloud Tasks rate limits) so each uvicorn worker handles one task at a time without contending on memory.

This alone should remove the queue-behind-busy-worker stalls the user is observing.

## 2. Batch the recovery render path

**Problem:** `render_specific_pages` in `pdf-server/app/tasks/document_tasks.py` loops page-by-page and spawns a fresh Ghostscript process per page. An 8-page stall recovery = 8 cold GS starts ≈ +5–8s of pure overhead.

**Change:** Use the same single-GS-batch approach as `generate_previews` (lines ~656–722): one `gs` invocation for `first_page=min(wanted)..last_page=max(wanted)`, then keep only the requested page numbers, then reuse the existing `_upload_page_io` ThreadPoolExecutor for S3 uploads.

## 3. Stop rasterizing thumbnails at preview DPI

**Problem:** `thumbnail_dpi=120` is defined in `pdf-server/app/core/config.py` but never used. Every page is rasterized at `preview_dpi=130` (~1.6 Mpx for A4) and uploaded as the preview, then Pillow downscales the same buffer to a 360px thumbnail and uploads that too. Two S3 uploads per page, double the bytes, more GS memory.

**Change (conservative):** On the upload happy path, render thumbnails only — skip the full-DPI preview upload. The full preview can be generated lazily the first time a user opens the inline viewer, using the existing `render_specific_pages` route. If we want to keep preview-on-upload for now, at minimum wire `thumbnail_dpi` so the preview pass uses ~96 DPI instead of 130 (≈45% fewer pixels and bytes).

I'll confirm with the user which variant they want before touching this — it slightly changes UX (first viewer open triggers a render).

## 4. Simplify frontend polling after job completion

**Problem:** In `src/hooks/useDocumentUpload.ts`, after the render job reports `completed` the code still enters a 45-iteration derived-files poll loop. The 90s `RENDER_STALL_MS` guard can also fire while pages are arriving normally, triggering up to 2 redundant recovery passes.

**Change:**
- After `pollJob` returns `completed`, do **one** `getDerivedFiles` call. If page count matches expected, skip the loop entirely.
- Only enter the recovery loop when pages are genuinely missing after that single check.
- Increase `RENDER_STALL_MS` from 90s to a value safely above the realistic batch budget (e.g. 180s) so it acts as a true watchdog, not a routine trigger.

## 5. Small cleanups (low risk, optional in this pass)

- Remove the dead Celery fanout path in `document_tasks.py:502–550` (already disabled on Cloud Run via `_on_cloud_run`); reduces noise when reading the file.
- Pass page dimensions out of the rasterize step so `_record_page` doesn't re-open each PNG with Pillow.
- Drop the duplicate `getAsset` call in `useDocumentUpload.ts` around `finalizeOrientationAndPrintReady`.

## Files touched

- `pdf-server/scripts/entrypoint.sh` — worker count default
- `pdf-server/app/tasks/document_tasks.py` — batch recovery, optional DPI wiring
- `pdf-server/app/core/config.py` — wire `thumbnail_dpi` if we take option 3
- `src/hooks/useDocumentUpload.ts` — single post-complete derived check, longer stall watchdog

## Not changing (audit confirmed these are correct)

- Batch GS path, `bulk_upsert_page_files`, D-chaining, Cloud Tasks idempotency guard, qpdf linearize fast path, adaptive `pollJob` backoff, `reconcileStuckDocument`. These are working as intended — leave alone.

## Deployment notes

- pdf-server changes go live only after the backend deploy workflow runs.
- Frontend changes go live on normal publish.
- Worker-count change requires the Cloud Run service to redeploy and replace instances; expect a brief gap.

## Open question before I build

For item 3 (DPI/upload reduction), do you want:
**A)** Conservative — keep preview upload on the happy path but drop it from 130→96 DPI (~45% smaller, same UX), or
**B)** Aggressive — skip the preview upload entirely on upload; generate it lazily when the user first opens the inline viewer (biggest savings, tiny UX delay on first viewer open).

If you don't want to decide now, I'll default to **A**.