## Root cause (confirmed via VPS inspection)

The 18-page upload is **not** hanging at random — the backend job actually **failed** with:

> `RuntimeError: Incomplete render: 17 of 18 page(s) missing → [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]`

Only page 1 rendered. The frontend never showed the error because it doesn't check the polled job's terminal status.

### The actual bug — Ghostscript output filename mismatch

In `pdf-server/app/services/pdf_ops.py::_gs_rasterize_pages`, GS is invoked per page with:

```
-sOutputFile=<dir>/page-%03d.png  -dFirstPage=N  -dLastPage=N
```

**Ghostscript's `%03d` is the *sequential output index* (always starts at 1), NOT the source page number.** So for page 5, GS writes `page-001.png`, not `page-005.png`.

Then `_render_one_page` looks for `page-005.png` and the verifier `_present_pages()` parses the trailing number from the filename and concludes page 1 is "present" while page 5 is "missing" — even though GS rendered the right content.

To compound it, in `generate_previews` the parallel ThreadPool runs 8 pages at once, all writing to the same `preview_dir/page-001.png`. They overwrite each other before upload — so even when a file ends up uploaded, its **content can be a different page** than its filename claims.

The page-1 fast-path "works" only by accident: page 1 is the one case where `page-001.png` matches.

The new strict `Incomplete render` check we added last round is doing its job — it correctly refuses to mark the asset `ready` — but the underlying renderer was broken all along. (Previously the bug was hidden because the same wrong file was uploaded for every page slot, just with different storage keys, so the count "looked" right.)

### Why the modal stays at 75%

`pollJob` resolves on terminal status (`failed`) but doesn't throw. `renderDocumentThumbnails` in `src/hooks/useDocumentUpload.ts` then proceeds to poll for derived files (finds 1 of 18 → ~90 s), runs two recovery passes via `/render-pages` (which hit the *same* bug and also fail), then writes a "ready" doc with 1 thumbnail + 17 gaps. Meanwhile the modal text never updates past 75 % because `onProgress` for the failed job is only called from `pollJob` while status is `pending`/`running`.

---

## Plan

### 1. Fix GS output naming — `pdf-server/app/services/pdf_ops.py`

Use a per-call output prefix that encodes the source page number, and bypass the `%03d` indirection entirely when rendering a single page.

- In `_gs_rasterize_pages`, when `first_page == last_page`, use `-sOutputFile=<dir>/<prefix>-<NNN>.png` (no `%03d`) so the file lands at the deterministic source-page name.
- For multi-page batch calls (page 1 fast path inside `rasterize_preview` when called without a range, etc.), keep `%03d` BUT post-process: rename `<prefix>-001.png … -NNN.png` to `<prefix>-<first_page+i-1>.png` so downstream `_present_pages()` sees the source page numbers it expects.
- `_present_pages` and the missing-pages retry loop continue to work unchanged.

### 2. Eliminate parallel-write filename collision — `pdf-server/app/tasks/document_tasks.py`

In `_render_one_page`, give each parallel call its **own** output directory so two threads can never overwrite the same `page-001.png`:

- Take `page` and use a per-page subdir: `preview_dir / f"p{page:03d}"` and `thumb_dir / f"p{page:03d}"`.
- After rasterization, the file is at a unique path the thread owns. The thumbnail downscale and S3 upload paths follow naturally.
- Apply the same isolation in `render_specific_pages`.

### 3. Recover the broken asset automatically

The asset `7348e289-46dd-487d-b773-e9f3434414e1` (and any other asset previously stamped as failed/incomplete) can be salvaged after the fix simply by re-running the new `/render-pages` endpoint with `pages: "missing"`. Add a tiny defensive step:

- In `render_specific_pages`, if the asset's status is anything other than `ready` and the recovery succeeds for every requested page, also run the existing "all pages present → mark ready" path (already there — verify it actually executes).

No data migration needed — the user can also just re-upload, but the auto-heal path will work for in-flight items.

### 4. Surface backend failure to the UI — `src/lib/documentCentreApi.ts` + `src/hooks/useDocumentUpload.ts`

Right now a `failed` job silently slips past `pollJob` and the modal sits at 75 %. Two changes:

- **`pollJob`**: add an option `throwOnFailure` (default `true`). When the terminal status is `failed` or `cancelled`, throw `Error("Job <id> failed: <job.error || job.result?.message || 'unknown'>")`. Keep the option so callers that want to inspect the job (e.g. background recovery) can opt out.
- **`renderDocumentThumbnails`**: catch the failure from `pollJob`, mark that upload entry as `error` with a friendly message ("Server couldn't render every page — please try again or contact support"), set progress to 100, and return early. The user gets a clear error in the modal instead of an indefinite spinner.

### 5. Sanity test after deploy

After redeploying the VPS:

- Re-upload `18pp_A4_Landscape.pdf` end-to-end and confirm 18 thumbnails appear.
- Curl `GET /v1/assets/<new-id>/derived-files` and confirm `preview_page` rows for pages 1–18 with distinct storage paths and image content.
- Confirm `pages_rendered: 18` in the job result.

---

## Files to edit

- `pdf-server/app/services/pdf_ops.py` — GS output naming fix (item 1)
- `pdf-server/app/tasks/document_tasks.py` — per-page output dirs in `_render_one_page` and `render_specific_pages` (item 2)
- `src/lib/documentCentreApi.ts` — `pollJob` throws on failed (item 4)
- `src/hooks/useDocumentUpload.ts` — handle the thrown failure in `renderDocumentThumbnails` (item 4)

After approval I'll implement the four edits, then you redeploy `pdf-server` API + worker and we re-test the 18-page upload.