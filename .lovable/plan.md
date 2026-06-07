## What I found

**Do I know what the issue is?** Mostly, yes — enough to stop patching around it and simplify the workflow.

The current upload path is still too complicated and is not honouring the intended fast-preview architecture:

1. **Customer previews still wait behind print preparation.**
   - `useDocumentUpload.ts` calls `finalizeOrientationAndPrintReady(... chainGeneratePreviews: true ...)` before `renderDocumentThumbnails(...)`.
   - That means the customer-facing “Rendering pages…” phase is downstream of `prepare_for_product` / CMYK preparation, instead of starting from the uploaded/metadata-known PDF.

2. **Rendering has too many recovery layers.**
   - `generate_previews` does MuPDF batch render, then upload/downscale/DB writes, then page-1 fallback, then remaining-page fallback, then salvage.
   - A failed upload/DB write for one page can make the UI sit at `7/8` while the backend starts extra fallback work.

3. **MuPDF command handling is fragile.**
   - The command currently adds `-O quality=90`; current MuPDF docs describe `-O` as overprint control, not JPEG quality.
   - `mutool draw` has no timeout, so a bad PDF or bad command can hold the worker.
   - Missing pages are retried as a range (`min(missing)-max(missing)`), which can redo pages that already succeeded.

4. **Resources look adequate in config.**
   - Light render worker is configured as 4 vCPU / 4 GiB / concurrency 1 on Cloud Run, with internal render pools.
   - So this looks more like workflow/command duplication than an underpowered worker.

5. **I could not query live job telemetry from this sandbox.**
   - Direct `psql` env is unavailable and Supabase read access returned forbidden, so the fix should add better in-app/runtime diagnostics and avoid relying on hidden logs.

## Plan

### 1. Split “fast customer preview” from “production print-ready”

Change the frontend upload flow so once inline metadata/page count is known:

- Start `generate_previews` immediately using the current uploaded/normalised PDF path.
- Start `prepare_for_product` in parallel/background for production output.
- Keep the upload modal waiting only for fast preview completion, not CMYK preparation.
- When production preparation completes, update the asset/document production PDF path and print-ready metadata.
- Re-render previews only if the prepared PDF changes page count, page boxes, width/height, or orientation in a way that invalidates the existing preview geometry.

### 2. Make preview rendering use an explicit source PDF

Add an explicit `source_storage_path` override to `generate_previews` jobs so the preview task renders the intended fast-preview PDF even if `prepare_for_product` updates `asset.normalized_storage_path` while previews are running.

This removes a race between:

```text
preview worker reads asset.normalized_storage_path
prepare worker replaces asset.normalized_storage_path
preview worker renders a moving target
```

### 3. Simplify the MuPDF render contract

Refactor `rasterize_pages_mutool` and `generate_previews` to be deterministic:

- Use one contiguous MuPDF command for `1-N`.
- Remove the questionable `-O quality=90` flag unless the installed MuPDF build proves it supports it.
- Add a subprocess timeout based on page count.
- Validate exact files `page-001 ... page-NNN`.
- Retry only the exact missing pages with one-page MuPDF commands.
- Stop doing broad range retries and avoid Ghostscript fallback for normal customer previews unless MuPDF is completely unavailable.

The intended flow becomes:

```text
mutool draw 1-N
  -> verify every page
  -> exact missing page retries only
  -> upload/downscale/record each verified page once
  -> fail loudly with diagnostics if any page is still absent
```

### 4. Remove duplicate fallback work in `generate_previews`

After the MuPDF batch succeeds or exact-page retries succeed:

- Do not run page-1 fast path.
- Do not run remaining-page Ghostscript fallback for pages already rendered.
- Do not salvage with a different engine unless the MuPDF path fully fails and the job explicitly records why.

This should prevent the `7/8` state from triggering more expensive duplicate work.

### 5. Improve progress reporting without extra load

Update backend events and frontend polling so the UI reports real progress clearly:

- Emit `page_batch`/render events after each page is recorded for small documents like 8 pages.
- Include `missing_pages`, `last_recorded_page`, `mutool_elapsed_ms`, and `upload_elapsed_ms` in job event metadata.
- Throttle derived-file polling to about once per second while the job is running.
- If a render stalls, show the exact missing page(s) instead of a generic hang.

### 6. Add a local and deploy smoke test for this exact case

Extend the existing MuPDF smoke script so it asserts:

- 8-page A4 PDF renders all 8 pages.
- The actual command shape used by production is tested.
- Missing page detection fails the script immediately.
- The script runs in CI/deploy before shipping the PDF server image.

### 7. Fix the `/files` 404 separately after render stability

The likely `/files` 404 is a routing/static-host rewrite issue or a backend `derived-files` 404 surfaced through `pdf-api`, but it was not captured in the network snapshot. I’ll keep it separate so we don’t mix a routing issue into the critical render fix.

## Validation

After implementation I’ll validate by:

- Running import/startup checks for the PDF server modules.
- Running the 8-page MuPDF smoke script.
- Checking the render command construction in code.
- Verifying no stale `s3_client`/bucket import issue returns.
- Confirming the frontend no longer waits on `prepare_for_product` before starting previews.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>