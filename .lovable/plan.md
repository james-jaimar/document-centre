# Pipeline performance + visibility plan (post-CMYK-first decision)

## Hard constraint — DO NOT VIOLATE

CMYK conversion must run **before** the customer sees page previews. The whole point of the conversion step is that customers see colours close to the printed output. Bright RGB Word/image exports can shift significantly when converted to CMYK. Showing previews from the raw RGB PDF first would defeat the entire colour-accuracy story.

So: no "parallel previews from raw PDF while CMYK runs in background". Order stays: upload → CMYK/prepare → MuPDF preview render → customer sees pages.

The fix is to make each of those steps fast and observable, not to reorder them.

## Goals

1. Prove the runtime path (is everything actually on GCP?).
2. Make MuPDF rendering deterministic and fast — single batch render, no silent Ghostscript fallback.
3. Cut wasted work in the CMYK/prepare → preview handoff so the customer waits only on real work, not on plumbing.
4. Give the admin UI real GCP-backed visibility (Cloud Run logs, Cloud Tasks queue stats, per-stage timings) so the next time something hangs we can see exactly where.

## Workstream A — Prove the runtime path

- Extend `/health` on every Cloud Run service to expose: role, queue_backend, Cloud Run service+revision, mutool/ghostscript/qpdf versions, MuPDF JPEG capability check result.
- Add an admin-only "PDF backend target" panel in `PlatformDocumentCentreOverview` that calls `pdf-api`'s sanitized diagnostic (upstream host, upstream `/health` result, effective storage bucket/region). Confirms at a glance there is no VPS hop.
- Update stale comments/docs that still say "VPS" where the runtime is now Cloud Run. Keep legacy fallback docs clearly labelled.

## Workstream B — MuPDF rendering hardening

- Add a startup self-check that runs `mutool draw -F jpeg` on a tiny built-in 1-page PDF and logs success/failure. Surface result in `/health`.
- In `rasterize_pages_mutool`, log every invocation with: command shape (no sensitive paths), page range, dpi, fmt/quality, elapsed ms, produced filenames, byte sizes, stderr tail on failure.
- Enforce completeness immediately after MuPDF batch: expected set must exactly match produced set.
- If MuPDF batch produces an incomplete set, retry with MuPDF per-page first. Only fall back to Ghostscript if MuPDF per-page also fails. Stamp `fallback_engine=ghostscript` on the job result/event when this happens so it shows up in ops.

## Workstream C — Make the existing CMYK-first flow fast

CMYK stays first. The customer-visible work is `prepare_for_product` (CMYK + orient + optional resize) → `generate_previews`. Speed it up by removing waste, not by reordering.

- **Disable the shared on-disk PDF cache on Cloud Run.** Heavy and light workers are separate Cloud Run services with separate filesystems — `cache_get` always misses, `cache_put` is wasted IO on heavy. Set `PDF_CACHE_ENABLED=false` on the workers via the deploy workflow. The light worker downloads the prepared PDF from S3 once (same region as the bucket → fast).
- **Pin `pdf-worker-heavy` to `min-instances=1`** (already in the deploy script) so the first upload of a quiet period doesn't pay a cold start before CMYK even begins. Verify it's actually applied after the next deploy.
- **Add per-step `timings_ms` to every job result** so we can see, for a specific stuck upload: S3 download, CMYK pass, orient pass, S3 upload, cache hit/miss, MuPDF raster, downscale, S3 upload of pages, DB write. Most of this already exists — finish wiring it through `prepare_for_product` and `generate_previews` end-to-end and surface in `/v1/ops/assets/{id}/pipeline`.
- **Stop double-rasterizing thumbnails at preview DPI.** `thumbnail_dpi=96` is defined but never used; everything gets MuPDF→JPEG at preview DPI then Pillow downscale. For thumbnails specifically, rasterize once at thumbnail DPI directly — cuts MuPDF time and bytes for the thumbnail track. Keep the full preview render exactly as it is.
- **Tighten the frontend post-completion poll** in `useDocumentUpload.ts`: after `pollJob` returns `completed`, do **one** `getDerivedFiles` check. Only enter the recovery loop if pages are genuinely missing. Lengthen the in-flight stall watchdog from 90s to 180s so it's a true safety net, not a routine trigger during slow CMYK runs.

## Workstream D — GCP-native observability inside the admin UI

- Grant `roles/logging.viewer` to the `dc-pdf-runtime` runtime SA so the existing `/v1/ops/logs/cloud-run` endpoint can actually read logs at runtime (it currently only works if the SA already has it).
- Add Cloud Logging filtering by `asset_id`, `job_id`, and Cloud Run service name to the ops UI — not just free-text search.
- Add Cloud Tasks queue stats + recent task listing so we can see what is queued / dispatching / retrying / running in real time.

## Workstream E — Deploy regression guards

- In the Cloud Run deploy workflow, after the container builds, render a tiny 2-page test PDF through the exact `mutool draw -F jpeg -O quality=90` command shape used in production. Fail the deploy if it doesn't produce both JPEGs.
- After deploy, hit `/health` on each Cloud Run service and fail the workflow if `queue_backend != cloud_tasks` or mutool capability check is `false`.

## Validation after implementation

Upload the same 8-page A4 demo PDF and confirm:

- ops asset pipeline shows `engine=mupdf`, no `fallback_engine`, all 8 pages produced.
- `timings_ms` shows where every second went (S3, CMYK, MuPDF, upload, DB).
- ops backend-target panel shows Cloud Run / Cloud Tasks; no VPS URL anywhere.
- Cloud Run logs can be queried from the admin UI by asset/job id.
- MuPDF raster step is in seconds, not minutes; total wall clock is dominated by the CMYK pass on the heavy worker, which is the expected and intentional cost of the colour-accuracy guarantee.
