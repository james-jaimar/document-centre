## Findings from the code path

The current code still has a slow path that can explain “5 minutes later, only page 6”:

1. `generate_previews` first tries one MuPDF batch render for all pages.
2. If that batch does not produce every page, it records what exists, then the remaining pages fall into `_render_page_cpu`.
3. `_render_page_cpu` currently uses `pdf_ops.rasterize_preview(...)`, which is Ghostscript PNG per page, not MuPDF JPEG.
4. The new `-B/-T` flags are also being added to single-page MuPDF retries, so if the Ubuntu `mupdf-tools` build rejects either option, we can accidentally push the whole job into the Ghostscript fallback path.

So the next fix should not be “add more CPU” blindly. It should make MuPDF the default for all preview rendering, and only use Ghostscript as a last-resort emergency fallback.

## Plan

### 1. Make MuPDF threading capability-safe

Update `pdf-server/app/services/pdf_ops.py` so threaded MuPDF is only used when the installed `mutool draw` actually supports the flags.

- Add a cached probe for `-B <band> -T <threads>` support.
- Use `-B/-T` only for multi-page batch renders, not single-page renders.
- If a threaded batch fails with an obvious option/usage error, retry once immediately without threaded flags instead of falling through to Ghostscript.
- Log whether threaded mode was `enabled`, `unsupported`, or `retried_unthreaded`.

### 2. Stop normal missing-page recovery from using Ghostscript

Update `pdf-server/app/tasks/document_tasks.py` so missing pages after the batch render use MuPDF single-page JPEG first.

- Add a MuPDF-based CPU helper for one page: `mutool draw` single page → thumbnail downscale.
- Use that helper in:
  - page-1 fast path
  - in-process remaining-pages pass
  - salvage pass
- Keep Ghostscript PNG only as a final per-page fallback if MuPDF genuinely cannot render that specific page.

This directly attacks the observed “page-by-page crawl”.

### 3. Add clear phase timings and progress metadata

Improve the instrumentation so the next production test tells us exactly what happened.

- Add timings for:
  - download/cache
  - render-box crop
  - MuPDF batch rasterise
  - missing-page MuPDF recovery
  - downscale
  - upload
  - DB record/finalise
  - total
- Include render mode in job metadata:
  - `batch_mutool_threaded`
  - `batch_mutool_unthreaded`
  - `single_page_mutool_recovery`
  - `ghostscript_last_resort`
- Include `K_REVISION`, CPU count, configured thread count, and MuPDF thread-support probe result.

### 4. Add a deploy-time smoke test for threaded MuPDF

Update `.github/workflows/pdf-server-deploy.yml` or the existing smoke script so the container validates the actual installed `mutool` before rollout.

- Run a tiny PDF through:
  - normal MuPDF JPEG render
  - threaded MuPDF render with `-B 256 -T 4`
- Print the exact `mutool draw` result in GitHub Actions.
- This prevents us shipping a config that silently sends production renders into fallback.

### 5. How to inspect the current stuck job manually

Since my Supabase DB access is currently blocked, you can inspect it in Supabase:

1. Open SQL Editor:
   `https://supabase.com/dashboard/project/lcvdhtaqoumyokjqaqfw/sql/new`
2. Run:

```sql
select
  started_at,
  finished_at,
  asset_id,
  job_id,
  stage,
  status,
  duration_ms,
  message,
  metadata_json
from public.job_events
where task_name = 'generate_previews'
order by started_at desc
limit 20;
```

The key things to look for are:

- `runtime.k_revision` — confirms the deployed Cloud Run revision.
- `runtime.mutool_threads` — confirms the new thread setting is active.
- `stage = 'mutool_failed'` — confirms MuPDF is failing and fallback is being used.
- messages like `Rendered 5 of 24 pages` — confirms the slow per-page path.

## Expected result

A 24-page document should no longer crawl through Ghostscript one page at a time in the normal path. Even if threaded MuPDF is unsupported, it should still use unthreaded MuPDF batch/single-page rendering before Ghostscript, which should be materially faster and much easier to diagnose from job events.