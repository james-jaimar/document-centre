# Upload + Render Pipeline — Findings & Fix Plan

Based on a full trace of the 8-page upload you just ran. Two subagents walked the entire frontend + backend path. Here's what's actually happening and what I want to tighten.

## What works
- The MuPDF deterministic batch path (turn before last) is now firing correctly — that's why the 8-pager felt quick.
- `inline_inspect` skips a Celery hop for metadata.
- `prepare_for_product` chains `generate_previews` server-side, so the client doesn't double-enqueue.

## Real issues found in the 8-page run

### A. Frontend (`useDocumentUpload.ts` + `renderDocumentThumbnails`)
1. **Dual polling streams.** While `generate_previews` is running, the client is hitting *both* `getJob` *and* `getDerivedFiles` on every adaptive tick (150ms → 1s). That's 2× the HTTP it needs.
2. **Two different progress formulas** for the same "Rendering pages… (X/N)" string:
   - In-flight: `65 + (found/total)*25` → 65–92%
   - Post-job loop: `75 + (found/total)*20` → 75–95%
   The bar can visibly jump backwards when the job flips to completed before all derived rows are flushed.
3. **Duplicate `getAsset` calls** around `finalizeOrientationAndPrintReady` (before + after).
4. **Per-page `normalize_orientation` jobs** fire from the client *and* `prepare_for_product` runs its own orientation pass server-side — redundant work on mixed-orientation PDFs.
5. **Recovery `renderPages` can spawn a 3rd render pass** even when the backend's own salvage already handled it.

### B. Backend (`pdf_ops.py` + `document_tasks.py`)
6. **No subprocess timeout on `mutool draw`** (`pdf_ops.py:1579`) or Ghostscript (`pdf_ops.py:1473, 1494`). A hung process wedges the Celery worker forever. The 10s+2s/page timeout I added last turn lives in the *new* per-page helper but the batch path still has none.
7. **Stale-file masking.** The output-dir glob (`pdf_ops.py:1614`) picks up files from prior partial runs. A failed page-3 retry can be hidden by a stale `page-003.jpg` from attempt 1.
8. **Sequential→source rename guard is asymmetric** (`pdf_ops.py:1607`): `not target.exists()` skips the rename if a stale file occupies the slot — silently keeping the wrong content.
9. **Zero-byte output not validated** before upload (`document_tasks.py:805` only checks `.exists()`). A corrupt JPEG would be uploaded and marked as success.
10. **Range-based retry, not exact-page** in `render_specific_pages` (`document_tasks.py:1311`): re-renders the bounding box even for sparse gaps like `[3, 47]`.

## Proposed fix plan (next build turn)

### Frontend (`src/hooks/useDocumentUpload.ts`)
- Collapse the dual polling: while `pollJob` is running, derive progress from the job's own `metadata.completed_pages` (already emitted by the backend) instead of an independent `getDerivedFiles` stream. Fall back to `getDerivedFiles` only after job flips to `completed`.
- Unify the progress formula into one helper so the bar is monotonic.
- Remove the duplicate `getAsset` call around `finalizeOrientationAndPrintReady`.
- Gate the client-side per-page `normalize_orientation` behind a flag, default off — let `prepare_for_product` handle it server-side.
- Skip the client-side recovery `renderPages` pass when the backend salvage already reported success.

### Backend
- Add `timeout=` to the batch `subprocess.run(mutool …)` and to both Ghostscript calls. Compute as `10 + 2*page_count`, hard ceiling 180s. Raise `MutoolRenderError`/`GsRenderError` cleanly on timeout.
- Use a **fresh tmp subdirectory per attempt** (batch, range-retry, salvage) so the glob can never see stale files. The directory is the contract.
- Add a `0-byte + min-size` check (>= 200 bytes) right after each render, before upload. Treat <threshold as missing.
- Change `render_specific_pages` (and the surgical retry in `generate_previews`) to render exact pages only, never a contiguous range derived from `min..max(missing)`.
- Emit the missing-page list and per-attempt timing into `job_events.metadata_json` so the admin asset inspector can show it.

### Telemetry / verification
- Extend `pdf-server/scripts/smoke-test-mutool-render.sh` to also assert:
  - Run with an intentionally injected stale `page-003.jpg` in the output dir → batch must overwrite it.
  - Run with `--timeout 1` simulated → must raise, not hang.
- Add a tiny CI step that runs the smoke script in the production container shape.

## Files to touch
- `src/hooks/useDocumentUpload.ts` (polling collapse, progress unify, dedupe)
- `pdf-server/app/services/pdf_ops.py` (timeouts on batch path + GS, per-attempt tmpdir, size check)
- `pdf-server/app/tasks/document_tasks.py` (exact-page retries, emit attempt metadata)
- `pdf-server/scripts/smoke-test-mutool-render.sh` (stale-file + timeout scenarios)
- `.lovable/plan.md` (record outcome)

## Deferred (not in this turn)
- Parallel "fast previews from source PDF" while CMYK runs in background — still on the list, but the duplicate-work + timeout fixes above unblock the current hang risk first.

Approve and I'll implement, then you can throw the 24-pager at it for a clean comparison.
