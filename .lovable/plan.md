## Plan: restore the VPS-style render contract

You are right: this is too complicated for normal customer uploads. The current code no longer behaves like the VPS path. It renders, retries, records, polls, salvages, and exposes partial page counts while work is still in motion. That is why the UI can jump forward, declare incomplete, then jump back to 3/8.

The fix should be a deliberate stability rollback for the upload preview path.

```text
Current normal upload path
PDF → batch render → retry missing pages → thumbnail/upload/DB in parallel
    → optional fan-out/salvage → frontend polls partial derived_files
    → frontend/manual render-pages recovery

Target safe path
PDF → one owned backend job → pages 1..N in order
    → validate each page image
    → create/upload/record preview + thumbnail
    → verify DB has every page
    → only then mark ready/done
```

## What I found in the code

- `generate_previews` is explicitly a multi-layer recovery pipeline, not a simple VPS renderer.
- The frontend still watches partial `derived_files` rows during the job, so progress can show transient states that are not the final truth.
- The backend has multiple paths that can classify a page as “missing”: raster missing, thumbnail missing, upload missing, DB record missing, or polling not seeing the row yet.
- The Cloud Run/runtime path is not the old VPS worker model: HTTP workers, Cloud Tasks, `/tmp` filesystem constraints, different worker counts, different timeouts.
- The unique derived-files index exists in migrations, but I could not prove from this session that production has it applied.

## Implementation steps

1. **Add a Safe VPS Mode for `generate_previews`**
   - For normal customer upload previews, route through a single backend-owned path.
   - Use one workspace and one source PDF.
   - Render pages `1..page_count` in deterministic order.
   - No fan-out, no in-upload `render-pages`, no competing recovery layer.

2. **Make page processing sequential and phase-explicit**
   - For each expected page:
     - confirm rendered preview exists and is a valid image
     - create thumbnail
     - upload preview
     - upload thumbnail
     - record both rows
   - If page 5 fails, record whether it failed at `raster`, `thumbnail`, `upload`, or `record` instead of the vague “missing page”.

3. **Stop frontend progress from reading partial truth**
   - During upload, the modal should not infer final page completeness from partial `derived_files` rows.
   - Show monotonic backend stages only: queued, rendering, finalising, done/failed.
   - No jumping from 7/8 to incomplete to 3/8.

4. **Keep recovery, but remove it from the happy path**
   - Keep `/render-pages` as a manual/admin tool.
   - Make it exact and sequential: render only the requested pages, then validate/upload/record them.
   - Do not let it race the original upload render.

5. **Align runtime defaults with the old VPS behaviour**
   - Ensure the PDF cache path is Cloud Run-safe (`/tmp/...`) when running HTTP workers.
   - Reduce light HTTP worker concurrency for render jobs so multiple PDFs do not fight for Ghostscript/Pillow memory inside one instance.
   - Increase page-level Ghostscript timeout enough for heavy Illustrator/transparency pages.

6. **Add one regression smoke test for the case you hit**
   - 8-page A5 PDF.
   - Scale/normalise to A4.
   - Run safe preview generation.
   - Assert 8 `preview_page` and 8 `thumbnail_page` rows.
   - Assert no automatic frontend recovery is invoked.

7. **Verify production before calling it fixed**
   - Confirm `derived_files_asset_kind_page_uniq` exists in production.
   - Pull latest failed `generate_previews` job/event rows for the failing asset.
   - Confirm worker env/runtime values match the safe-mode assumptions.

## Expected result

Normal uploads behave like the VPS again: one backend job owns the render, pages are handled deterministically, and the UI only reports final verified state rather than reacting to intermediate partial rows.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>