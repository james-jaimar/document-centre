## Diagnosis

The paperSizes.ts fix (DL = 99 × 210 mm added to `ISO_SIZES`) is in place, so new uploads *at upload time* will now match DL correctly.

However, the DL Flyer.pdf in the screenshot was uploaded **before** that fix. Its `preflight_data.detected_size` was persisted to the database as `"Custom size"` (the `UNKNOWN_SIZE_LABEL`) with `size_resolved = false`. The non-ISO advisory effect in `src/pages/dashboard/OrderFiles.tsx` (lines 916–953) trusts that stored field and re-opens the modal, offering "Keep original (99 × 210 mm) — Print at Custom size" even though the client now recognises DL.

The advisory picker never re-checks the current dimensions against the updated `matchIsoSize`, so any doc whose stored `detected_size` is stale stays stuck on the wrong path.

## Fix (single file: `src/pages/dashboard/OrderFiles.tsx`)

In the non-ISO advisory effect (around line 919, the `documents.find(...)` predicate):

- Compute `w`/`h` from `page_width_mm`/`page_height_mm`.
- If `matchIsoSize(w, h)` returns a hit, **skip this doc** from the non-ISO candidate list. The ISO effect immediately below (lines 957–1003) will then handle it correctly — either silently locking to DL as the session size, or opening the locked-variant advisory that shows the true ISO name.
- Also mark the doc via `resolvedDocIds.current.add(d.id)` so the stale non-ISO branch never re-fires for it.

That's the entire client-side change. No DB migration, no re-processing of preflight rows — the next render pass re-classifies the document against the corrected ISO table.

## Out of scope

- No changes to `paperSizes.ts` (DL is already there with 99 × 210 mm).
- No changes to `useDocumentUpload.ts` — new uploads already classify correctly.
- No backfill of `preflight_data.detected_size` in the database; the client-side re-check makes backfill unnecessary.
- No changes to the advisory modal UI.
