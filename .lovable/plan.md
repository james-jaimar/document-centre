## Goal

Colour leak is fixed. Now do an end-to-end audit of every other spec the customer can set so each one flows correctly from the cart → `product_snapshot`/`configuration` → `TargetSpec` → print-ready PDF (and job ticket). Fix any params that are read but not applied, or applied but not cached.

## Parameters in scope

| Param | Source of truth | Currently wired? |
|---|---|---|
| Paper size (width/height_mm) | `snap.width_mm/height_mm` + size slugs | Yes — but slug table is small (A3–A6, Letter, Legal, Tabloid, DL, biz card, square A4/A5). SRA, custom, photo sizes missing. |
| Orientation | slug/label sniffing + canvas-derived | Yes |
| Colour mode (document-wide) | `sections[].is_color` then slug fallback | Yes |
| Per-section colour (e.g. B&W body + colour cover) | `sections[].is_color` | **Not applied** — flagged as "planned follow-up" |
| Sides / duplex | `sections[].is_duplex` | **Read into cache hash only, never acted on** (no simplex→duplex page expansion, no duplex flag on `TargetSpec`) |
| Print-to-edge / bleed | slug/label + `cfg.print_to_edge` + `target.bleed_mm` | Yes (auto-expand if missing) |
| Paper type/weight | `snap.paper_weight_gsm`, `cfg.paper` | Job ticket only — no effect on PDF (correct, paper is a press attribute) |
| Cover / finishing / lamination | `cfg.cover`, `cfg.finishing` | Job ticket only (correct, post-press) |
| Binding | `snap.binding` | Drives imposition strategy only |

## Plan

1. **Audit harness (one-off script, no behaviour change)**
   - Add `pdf-server/scripts/audit-print-spec.py <job_id>` that loads a bundle, prints the resolved `TargetSpec`, the section flags, what `assemble_print_ready_for_job` would do (`needs_resize`, `needs_bleed`, `needs_greyscale`), and the resulting `assembly_report.steps` from the last run.
   - Lets us spot mismatches per job without re-running production.

2. **Expand paper-size slug table** in `production_orchestrator.py::_PAPER_SIZES_MM`
   - Add SRA3/SRA4, A2, custom photo sizes the catalogue actually offers (4R, 5R, 6R, 8R, etc.), and the "square_*" / portrait/landscape variants used by the storefront.
   - Add a fallback: if no slug matches, but `snap.selected_options` carries a `{width_mm,height_mm}` option payload, honour it.

3. **Wire per-section colour mode** (replaces the "planned follow-up" note)
   - In `assemble_print_ready_for_job`, when `printable_sections` is mixed colour/B&W:
     - Greyscale each B&W section's source PDF before merge, leave colour sections untouched.
     - Use the existing `pdf_ops.grayscale()` ladder per file.
   - When `merge_directives` are present, walk them by `section_id` and apply per-section greyscale based on `sections[section_id].is_color`.
   - Surface per-section outcomes in `assembly_report.colour_check.sections[]`.

4. **Wire duplex / sides into the print-ready pipeline**
   - Add `duplex_mode: "simplex" | "duplex" | "mixed"` to `TargetSpec`, resolved from `sections[].is_duplex` the same way colour is.
   - If a section is `simplex` but its source PDF has odd-then-even content, insert blank back pages so the press doesn't accidentally print on the back of the previous sheet (mirrors the existing simplex-cover blank insertion in `merge_directives`).
   - Add `duplex_mode` to `assembly_report.target` and to the spec-hash inputs (separately from the existing section_flags so duplex changes invalidate cache cleanly).

5. **Tighten resize/orientation guard**
   - `needs_resize` currently uses a 2 mm tolerance — keep it, but also re-evaluate orientation: if `target.orientation` differs from actual page orientation, force `resize_pages(..., dominant_orientation=target.orientation)` even when dimensions match transposed.

6. **Job ticket completeness**
   - `_render_ticket_pdf` reads `snap.size`, `snap.paper`, `snap.colour`, etc. — confirm these survive `buildJobSnapshot.ts`. If any are stripped (we know "Print Colour" / "Print Sides" are), resolve them from `sections[]` instead so the operator ticket shows the same truth the worker used.
   - Add a "Colour mode (resolved)" and "Duplex (resolved)" row sourced from `TargetSpec`, not raw snapshot, so the ticket reflects what was actually produced.

7. **Cache invalidation**
   - Bump `colour_pipeline_version` (or rename to `pipeline_version`) to `6` so per-section colour + duplex changes regenerate existing artefacts.

## Verification

1. Run the audit script against a handful of jobs that exercise: pure colour, pure B&W, mixed colour cover + B&W body, simplex flyer, duplex booklet, non-A-series sizes.
2. Re-assemble each in production; confirm `assembly_report.target` matches the customer spec, `colour_check.sections` shows per-section outcomes, and the job ticket prints the resolved values.
3. Spot-check the actual PDFs in Acrobat (page sizes, simplex blanks, mixed colour pages).

## Technical notes

- All work stays in `pdf-server/app/services/production_orchestrator.py`, `pdf-server/app/services/pdf_ops.py`, `pdf-server/app/tasks/production_tasks.py`, plus the new audit script. No DB schema changes; no edge-function changes.
- `TargetSpec` gains `duplex_mode` (optional, defaults to `None` = unknown / no-op).
- Cache invalidation is the only behaviour change for unaffected jobs — they'll regenerate once, then resume cache hits.
