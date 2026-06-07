## What is actually wrong

Two layers of problems, both fixable in one short pass.

### Layer 1 — A real bug in the new Ghostscript renderer

In `pdf-server/app/services/pdf_ops.py` line 2151 the function `rasterize_pages_ghostscript_jpeg` references a variable that does not exist:

```python
if not single_page_direct:   # NameError — never defined in this function
    seq_to_src: list[tuple[Path, Path]] = []
    ...
```

That variable was supposed to be introduced in the previous edit but the definition was never added. As soon as Ghostscript finishes the batch render, this line raises `NameError`, the retry/backoff wrapper catches it, sleeps, tries again, fails again, then falls into the per-page salvage path which calls the same broken function once per page. Every page then has to wait the full GS batch timeout (90s) and per-page timeout (20s) before giving up.

That alone explains "stuck on page 3 / page 5 for minutes". The renderer was effectively never returning a successful batch since the last deploy.

### Layer 2 — Runtime drift from the VPS (subagent diff)

Even with the bug fixed, three Cloud Run settings are materially worse than the VPS:

1. `pdf-worker-heavy` is deployed with **2 vCPUs** while every GS call still asks for `-dNumRenderingThreads=4` → thread oversubscription on the heavy worker. (Previews actually run on the **light** worker which has 4 vCPUs, so this hurts prepare-for-product more than previews — but the user does feel the end-to-end time.)
2. The deploy workflow sets `PDF_CACHE_ENABLED=false` on every Cloud Run worker. The VPS had it on, so the heavy worker handed the prepared PDF to the light worker via local disk. On Cloud Run the light worker re-downloads the PDF from S3 before every render.
3. `RENDER_CPU_CONCURRENCY` auto-sizes to `cpu_count - 1`, which is `1` on the 2-vCPU heavy worker. That serialises the CPU pool so nothing overlaps with uploads.

## Fix plan (small, targeted, no rewrite)

1. **Fix the NameError in `pdf-server/app/services/pdf_ops.py`** — define `single_page_direct = (first_page == last_page)` near the top of `rasterize_pages_ghostscript_jpeg`, and when true, point the GS `-sOutputFile` pattern directly at `{base_name}-{first_page:03d}.{ext}` so no rename pass is needed. This restores the batch render path and removes the false "incomplete" exception loop.

2. **Tighten the failure-mode timing in `pdf-server/app/tasks/document_tasks.py`** — when the GS batch raises `RasterizationIncompleteError`, log the stderr tail to `job_events.metadata` and skip straight to the parallel per-page GS pass, instead of also running MuPDF salvage (already disabled by default, but make the code path explicit). Keep `preview_gs_batch_timeout_seconds` at 90 and `preview_gs_page_timeout_seconds` at 20.

3. **Re-enable the local PDF handoff cache on Cloud Run** — in `.github/workflows/pdf-server-deploy.yml`, change `PDF_CACHE_ENABLED=false` to `PDF_CACHE_ENABLED=true` for the light worker (heavy can stay off — it writes, light reads). Cloud Run instances persist `/tmp` for the lifetime of the container, so within a warm worker this removes the redundant S3 download before each preview render. Misses still fall back to S3, so this is safe.

4. **Pin GS threads to match real vCPUs** — already done: `PREVIEW_GS_THREADS=1` is the default. Also pass `-dNumRenderingThreads=1` (or drop the flag) in the non-preview GS calls so the 2-vCPU heavy worker stops oversubscribing.

5. **Override `RENDER_CPU_CONCURRENCY` on Cloud Run** — set it explicitly to `3` for the light worker (4 vCPUs, leave one for uvicorn) in the deploy workflow so the in-process CPU→IO pipeline actually overlaps work.

6. **Add a smoke check that runs in CI**: extend `pdf-server/scripts/smoke-test-ghostscript-render.sh` to also exercise `rasterize_pages_ghostscript_jpeg` via Python (not just raw `gs`) so a regression like the NameError fails the build instead of shipping.

7. **Telemetry**: emit one `job_events` row per GS attempt with `cmd`, `returncode`, `elapsed_ms`, `stderr_tail`, `missing_pages` so we never again have to guess why a render hung. Most of this is already wired — the missing piece is logging the stderr tail on the *successful* path so we can see warnings.

## Expected outcome on the 8-page test PDF

- GS batch render: ~3–5 s (already proven by the smoke test).
- Upload + DB write: ~2–4 s (overlapped with render now that `RENDER_CPU_CONCURRENCY=3`).
- End-to-end from upload to preview-ready: target ≤ 15 s on a warm light worker, ≤ 30 s on a cold start. This matches the VPS 45–60 s figure with headroom.

## What I will not touch

- No changes to the MuPDF path, the preview UI, the asset/job schema, or any front-end code.
- No infrastructure changes beyond two env vars in the deploy workflow.
- No rollback to the VPS — the fix is forward, not sideways.

## Risk

Low. The NameError fix is a one-liner that restores the documented behaviour. The env-var changes are reversible by re-running the deploy workflow. The CI smoke test guards against re-regression.
