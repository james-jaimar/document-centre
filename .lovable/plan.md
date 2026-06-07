## What I found so far

- The upload modal reaches `Rendering pages… (1/8)` from `renderDocumentThumbnails()` in `src/hooks/useDocumentUpload.ts`.
- The no-advisory upload path currently does: browser upload to S3 → `createAsset` inline pikepdf metadata probe → `prepareForProduct` CMYK/orientation work → chained `generate_previews` job → frontend polls derived files.
- `generate_previews` is meant to use one MuPDF batch call for page counts under `RENDER_BATCH_THRESHOLD=200`, but if that batch path fails or misses files it silently falls back into the older per-page Ghostscript path.
- The screenshot showing `Rendering pages… (1/8)` strongly suggests the fast MuPDF batch path is not producing/recording the full 8-page set in production, then the fallback path is crawling or getting stuck.
- I could not query live Supabase job/asset rows because the Supabase tool returned `SUPABASE_FORBIDDEN`; the plan below will add enough in-app/admin diagnostics so we can see the real production/GCP state without guessing.
- The visible `files/:1 404` needs full request details from a reproduced browser session. Current code searches did not show a direct `/files/1` API call; it may be a route/resource artefact or a bad relative URL, but I will verify before changing it.

## Plan

### 1. Prove the actual runtime path for this exact upload

Add an upload/render trace that can be read from the admin Asset inspector and logs:

- Generate a trace identifier for each upload/render chain.
- Carry it through:
  - frontend `createAsset`
  - `prepareForProduct`
  - chained `generate_previews`
  - `render_specific_pages` recovery
  - job events and job result metadata
- Record for each job:
  - Cloud Run service/revision/role
  - queue backend (`cloud_tasks` vs `celery`)
  - worker hostname
  - storage mode/bucket/region
  - renderer selected (`mutool_batch`, `mutool_range`, `ghostscript_fallback`)
  - elapsed milliseconds per step

This gives us a byte/path audit trail without relying on guesswork.

### 2. Fix the likely MuPDF batch escape hatch

Harden `generate_previews` so the fast path is deterministic:

- Run one contiguous MuPDF render for `1-N` pages.
- Verify that every expected output file exists before any fallback path starts.
- If MuPDF fails, record the exact command, return code, stderr snippet, output file list, and missing pages in the job event/result.
- Do not silently look “successful” after only page 1.
- Prefer MuPDF for any recovery/range render too; keep Ghostscript as last-resort only.

Technical target:

```text
mutool draw -F <working-jpeg-format> -r 150 -O quality=90 -o page-%03d.<ext> input.pdf 1-8
```

Then downscale thumbnails from those files and upload/record all pages.

### 3. Make MuPDF format detection real, not inferred

The `/health` endpoint currently checks whether help text mentions JPEG. That is not enough.

I will change health/smoke validation to actually render a tiny generated PDF through MuPDF using the configured format and quality:

- Test `-F jpeg` and/or `-F jpg` as needed.
- Report the exact accepted format token.
- Use that accepted token in rendering instead of assuming the deployed MuPDF build accepts `jpeg`.
- Add a container smoke test that renders an 8-page A4 PDF and asserts page `001` through `008` are produced.

This directly addresses the “MuPDF should chew through this in seconds” expectation.

### 4. Remove slow fallback loops from the customer-critical path

The current fallback can drift into per-page Ghostscript and salvage behaviour, which is exactly what feels like a crawl.

I will adjust the render contract:

- Primary: one MuPDF batch render.
- Secondary: one MuPDF range render for missing pages.
- Final fallback: Ghostscript single-page only when MuPDF explicitly fails a page, with a clear job event naming that fallback.
- Stop frontend self-recovery from repeatedly creating slow full recovery loops when the server already knows exactly which pages are missing.

The UI should either complete quickly or fail with a specific reason; it should not sit at `1/8` indefinitely.

### 5. Keep CMYK-first intact

I will not move preview rendering before CMYK/print-ready.

The flow remains:

```text
uploaded PDF
  → metadata probe
  → CMYK / print preparation
  → MuPDF preview images from prepared PDF
  → customer sees final-colour preview
```

The optimisation is inside render/prep mechanics and observability, not a reordering of print intent.

### 6. Verify and fix the `files/:1` 404 separately

During reproduction I will capture the full failing request URL and initiator.

Depending on what it is:

- If it is a broken app route, fix the route/navigation.
- If it is a relative preview/download URL, force absolute signed S3 URLs.
- If it is only a dev tooling/source-map artefact unrelated to upload, leave it alone and document it.

I will not assume it is related until the full request proves it.

### 7. Prove GCP vs VPS routing

Add/extend diagnostics so the admin dashboard can answer the question directly:

- API `/health`: already exposes Cloud Run service/revision/queue/render settings.
- Worker job events: include Cloud Run `K_SERVICE`, `K_REVISION`, role, queue backend.
- Admin Asset inspector: show whether the job ran on `pdf-worker-heavy`, `pdf-worker-light`, or a legacy/VPS/Celery worker.
- Remove the dead module-level S3 client/hardcoded bucket in `storage.py` so cold-start/storage diagnostics are not polluted.

### 8. Validation after implementation

I will validate with:

- Python compile checks for touched backend files.
- Container-level smoke test script for an 8-page A4 PDF:
  - MuPDF render produces 8 JPEG pages.
  - no Ghostscript fallback on the happy path.
  - job result includes timings and renderer path.
- Frontend check that the upload progress can no longer sit silently at `1/8`; it will show real rendered count or a specific server failure reason.

## Files expected to change

- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/tasks/document_tasks.py`
- `pdf-server/app/tasks/operation_tasks.py`
- `pdf-server/app/main.py`
- `pdf-server/app/services/storage.py`
- `pdf-server/app/services/ops_service.py`
- `pdf-server/app/web/ops_routes.py`
- `pdf-server/scripts/*smoke*` or a new render smoke script
- `src/hooks/useDocumentUpload.ts`
- `src/lib/documentCentreApi.ts`
- `src/lib/opsApi.ts`
- `src/pages/platform/PlatformDocumentCentreAssets.tsx`