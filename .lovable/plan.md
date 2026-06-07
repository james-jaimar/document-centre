# Render hang fix — implementation status

## Shipped in this turn (backend hardening)

1. **MuPDF command shape fixed** (`pdf-server/app/services/pdf_ops.py:rasterize_pages_mutool`)
   - Dropped the `-O quality=N` flag. Per the MuPDF docs `-O` controls overprint simulation (0/1/2). `quality=90` is either ignored or rejected depending on the build — a likely cause of incomplete renders.
   - Added `-q` (quiet) so `stderr` only carries real errors.
   - Added a subprocess `timeout` (`10s + 2s/page`, capped at 180s) so a malformed PDF can no longer wedge the worker.
   - Empty-file verification: a 0-byte output file now counts as a missing page.
   - `quality` arg kept on the function signature for backwards compatibility; it is intentionally ignored.

2. **Surgical per-page retry instead of range retry** (`pdf-server/app/tasks/document_tasks.py:generate_previews`)
   - When the batch render reports missing pages, retries now render each missing page in its own single-page MuPDF invocation via the new `pdf_ops.rasterize_one_page_mutool` helper.
   - No more `min(missing)-max(missing)` range retry that re-rendered successful pages and could amplify a transient issue into long stalls.
   - Diagnostic event metadata now records per-page retry outcomes (`results`, `still_missing`) so the admin asset inspector shows exactly which pages refused to render.

3. **Smoke test extended** (`pdf-server/scripts/smoke-test-mutool-render.sh`)
   - Now uses the same command shape as production (no `-O quality=`, with `-q`).
   - Adds a per-page retry pass that renders each page individually and asserts every output is present and non-empty — the exact path that recovers a "7/8" partial render.

## Validated

- `python3 -c "import ast; ast.parse(...)"` on both modified Python files.
- `bash -n` on the smoke script.

## Deferred (next turn)

These are larger and worth landing as their own change with explicit verification:

- **Decouple customer preview from print-ready preparation.** Today `useDocumentUpload.ts` calls `prepare_for_product` with `chainGeneratePreviews: true`, so previews only start AFTER CMYK preparation. Plan is to start `generate_previews` immediately against the normalised PDF and run `prepare_for_product` in parallel, then update the production PDF path when it lands. Requires a backend `source_storage_path` override on the preview job to avoid racing the prepared PDF overwrite.
- **Throttle derived-file polling** to about once per second while a job is running (currently fires on every `pollJob` tick).
- **`/files` 404 investigation** once we have a clean network trace (kept separate so it doesn't muddy the render fix).
