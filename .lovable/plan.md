## Problem

When two sections (e.g. `front_cover` + `back_cover` for business cards, or front/back for flyers/leaflets/covers) point at the **same source PDF** with different `page_range_start` / `page_range_end`, the print-ready assembler still merges the **entire file twice**. A 2-page source ends up producing a 4-page print-ready (page 1, page 2, page 1, page 2) instead of the expected 2-page front/back.

The merge directives written by the client already carry `page_range_start` / `page_range_end` (0-indexed) per section — `src/lib/orders/buildJobSnapshot.ts` lines 472–484. The pdf-server worker just ignores them.

## Root cause

`pdf-server/app/tasks/production_tasks.py` (~lines 241–269): for every `kind: "section"` directive it downloads the source PDF and appends the **whole file** to the merge list. There is no slicing by page range, and no dedup of "same source already fully consumed".

`pdf-server/app/services/production_orchestrator.py` `section_paths` only carries `(filename, storage_path)` — page-range metadata never reaches the worker, even though it's in the directive dict.

## Fix

Slice each section by its directive's page range at assembly time. Range data is already on the directive, so no schema/snapshot changes are needed.

### Worker change (`pdf-server/app/tasks/production_tasks.py`)

In the `kind == "section"` branch of the merge-directive loop:

1. After downloading the source PDF once (existing `downloaded[path]` cache stays), read `page_range_start` / `page_range_end` from the directive.
2. If a range is present AND it does **not** cover the full file, extract just those pages to a new temp PDF (`{idx:03d}-{stem}-p{start}-{end}.pdf`) using `pypdf.PdfWriter` (or an existing helper in `pdf_ops`) and append that sliced file instead of the full download.
3. If the range covers the entire file (or is missing), keep current behaviour (append the full file).
4. Cache slices by `(path, start, end)` so repeated identical slices reuse one temp file.
5. Apply per-section greyscale and the simplex-back blank-page logic on the **sliced** file, not the original, so page-count checks remain correct.

Page indices in the directive are **0-indexed** (see `src/pages/dashboard/OrderFiles.tsx`); pypdf is also 0-indexed, so use directly. Guard against out-of-range values (clamp to `[0, page_count-1]`) and skip the section with a warning if the range is invalid.

### Optional shortcut (safe & easy)

If, after processing all directives, the resulting `files` list is exactly the page sequence of a single underlying source PDF in order with no blanks/greyscale needed, reuse the original file (skip merge). This is a minor optimisation — defer unless trivial.

### What this fixes across the catalogue

Any product whose configurator assigns multiple sections to the same source with `page_range_*` set:

- Business cards (1 source, 2 sections: front=page 0, back=page 1)
- Flyers / leaflets (double-sided, same pattern)
- Brochures (bi-fold / tri-fold — `OrderFiles.tsx` lines 1933–1953 already write ranges)
- Bound documents with covers split from a combined cover PDF
- Any future product that splits one upload into front/back faces

No client changes required because snapshots already carry the ranges.

## Verification

1. Place a fresh business-card order in Document Centre Demo with a 2-page source.
2. Run **Assemble** in the admin Production panel.
3. Download the print-ready PDF — expect exactly 2 pages (front, back), not 4.
4. Repeat with a double-sided flyer (1 source, 2 sections), a bi-fold brochure, and a bound document with a 2-page cover file to confirm no regressions.
5. Confirm `assembly_report.steps` shows the slice step (e.g. `slice:front_cover:0-0`) and that single-source / full-range jobs still take the fast path.

## Out of scope

- Imposition and job-ticket generation (unchanged).
- Snapshot/migration changes (ranges already present).
- Photo prints (separate assembler, already handles this correctly).
