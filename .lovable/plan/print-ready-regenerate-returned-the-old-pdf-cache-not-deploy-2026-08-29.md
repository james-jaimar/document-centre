# Print-ready regenerate returned the old PDF — cache, not deployment

## What the evidence shows

Nothing is wrong with the deployment, and nothing is needed from you.

- The last commit touching `pdf-server/app/services/templated_artwork_assembly.py` is `2026-08-28 19:56 UTC` (21:56 GMT+2). The only later commit that day was a compiled `.pyc`, no source. So Cloud Run deploy #104 "Fixed PDF bleed/crop marks" carries the CMYK / embedded-font / bleed-preservation code.
- The regenerate you ran this morning did **not** stall. The pdf-server job row `abef4a09…` shows: created `06:18:41`, started `06:18:56`, finished `06:18:59`, status `completed`, result:
  `{"spec_hash": "654bc5fd…", "reused_cache": true, "storage_path": ".../8b31d3dd-….pdf"}`
- `reused_cache: true` means the worker short-circuited and handed back the artefact built at `2026-08-28 14:43 UTC` — **before** the 19:56 deploy. That is why `print_ready_assembled_at` never moved and why the file you downloaded is still the trimmed, RGB-text, unembedded-font version.

Root cause: `assemble_print_ready_for_job` reuses the previous PDF whenever `spec_hash` matches and `force` is false. The hash is built only from job/template inputs plus a hard-coded `templated_artwork_pipeline_version: 1`, which was never bumped when the assembly engine changed. So a code fix is invisible to the cache.

## Plan

### 1. Bump the pipeline version (the real fix)
In `pdf-server/app/tasks/production_tasks.py`, raise `templated_artwork_pipeline_version` from `1` to `2`. Every templated-artwork job then gets a new spec hash and re-assembles once with the fixed engine — no manual force needed, and the cache still protects repeat downloads afterwards.

Treat this as the standing rule: any change to `templated_artwork_assembly.py` output must bump that version in the same commit.

### 2. Make cache reuse visible instead of silent
- `production-pdf` edge function: pass `reused_cache` from the pdf-server job result back to the caller.
- `useProductionArtefacts` / `ProductionPanel`: when a generate returns `reused_cache: true`, toast "Existing PDF reused (unchanged spec)" rather than "Print-ready PDF generated", so a no-op is never mistaken for a rebuild.

### 3. Make the buttons unambiguous
`ProductionPanel` currently has a plain "Generate" (no force) and a separate force path. Label the second one explicitly "Force rebuild" and keep `force: true` on it, so re-running after a server-side fix is a deliberate, obvious action.

### 4. Re-run the job and verify
After the version bump deploys, regenerate `INV-00136-1` and confirm from the new `jobs` row that `reused_cache` is `false`, `print_ready_assembled_at` advances, and the `assembly_report` shows the embedded Liberation fonts plus a preserved MediaBox/BleedBox.

## Technical notes
- Cache check lives at `production_tasks.py:221`; the hash inputs are assembled just above at lines 208-218.
- The same hard-coded-version pattern exists on the photo (line 101), canvas (166) and generic (298) branches — worth the same discipline, but this change touches only the templated-artwork one.
- `print_ready_assembled_at` is written only on the non-cached branch, which is why it is a reliable "did it actually rebuild" signal in the UI.
