## Goal

Stop the preview renderer from jumping around, hanging, or ending with missing pages.

**Root cause found:** psycopg3's server-side prepared statements clash with Supabase's PgBouncer transaction pooling, causing `InvalidSqlStatementName` errors mid-render. This makes the worker silently fail and the frontend hang.

**Fix applied:** Disabled prepared statements in `pdf-server/app/db/session.py`.

**Remaining step:** Rebuild & redeploy the `pdf-worker-light` Cloud Run service.

```text
Current path
render batch → retry missing → parallel upload/record → optional fan-out → salvage → frontend polls partial rows

New normal upload path
one backend job → page 1..N in order → validate → thumbnail → upload → record → verify all pages → done
```

## What I will change

### 1. Make `generate_previews` deterministic again

In `pdf-server/app/tasks/document_tasks.py`, replace the normal customer preview path with a sequential safe renderer:

- Download the prepared/normalised PDF once.
- Determine the expected page count once from the asset.
- For each page from `1..page_count`, in order:
  - render exactly that page with Ghostscript;
  - validate the image with Pillow;
  - create the thumbnail;
  - upload preview and thumbnail;
  - record both `derived_files` rows;
  - emit a page progress event.
- After the loop, query `derived_files` and only mark the asset/job ready if every page has both:
  - `preview_page`
  - `thumbnail_page`

If page 5 fails, the job will say page 5 failed at the exact phase, instead of falling into a vague “missing/recovering” loop.

### 2. Remove competing happy-path recovery

Keep `render_specific_pages` / `/render-pages` as a manual/admin recovery tool, but remove it from the normal upload path.

The upload renderer should not:

- fan out per-page HTTP tasks;
- start a salvage race while the original job is still running;
- infer success from partial rows;
- continue after a failed render as if it can “finalise”.

### 3. Stop the upload modal reading partial truth

In `src/hooks/useDocumentUpload.ts`, remove in-flight polling of `derived_files` during `renderDocumentThumbnails`.

The modal will show monotonic backend stages only:

- queued;
- rendering pages;
- finalising;
- done;
- failed with the real backend error.

It will not display `7/8`, then `3/8`, or “Render incomplete — finalising…” while pages are still being created.

### 4. Make failure honest and non-destructive

If the backend cannot render all pages:

- leave the document in a clear failed/processing state instead of stamping a partial thumbnail array as ready;
- preserve `thumbnail_gaps` for the file-list recovery button;
- show the real failure message rather than looping behind the modal.

### 5. Keep performance secondary to correctness

For now, normal uploads will prioritise correctness over speed.

The current parallel/fan-out code can remain behind a non-default setting if useful later, but the default customer upload path should be the stable sequential path matching the old VPS behaviour.

### 6. Add focused regression coverage

Add or update a smoke test around the exact failing shape:

- 8-page PDF;
- A5 scaled/normalised to A4;
- run the safe preview generator;
- assert all 8 preview rows and all 8 thumbnail rows exist;
- assert no frontend auto-recovery path is invoked.

### 7. Verify before calling it fixed

After implementation, I will verify with the strongest available signal in this environment:

- Python syntax check for changed backend files;
- targeted frontend test or static validation for changed frontend code;
- inspect the final code path to confirm `generate_previews` no longer reaches fan-out/salvage for normal uploads.

If database/log access is available during build, I will also check recent failed jobs for the exact failure phase. If not, I will not pretend I saw production logs.