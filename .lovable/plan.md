## Goal

Three fixes to the production pipeline:

1. Scale documents correctly when they carry bleed + crop marks.
2. Surface *every* production component (cover **and** body) for imposition, not just the first.
3. Let the operator pick a separate imposition template per component.

---

## 1. Bleed-aware scaling (pdf-server)

Current behaviour (`pdf_ops.resize_pages`, trim-box branch): when the source has real bleed, it scales the TrimBox to the target using a single uniform `min(sx, sy)` factor and scales the bleed margin by the same factor. For A5 → A4 that gives a trim slightly under A4 and a bleed of ~4.24 mm (media ≈ 218.5 × 305.5 mm) — not what the press expects.

New behaviour:

- Add a `target_bleed_mm: float | None` parameter to `resize_pages`.
- When the source has real bleed **and** `target_bleed_mm` is set:
  - Clamp the source bleed margin used for content sampling to a maximum of 3 mm per edge (trim to bleed, discard anything beyond — customer crop marks fall outside and are dropped).
  - Scale the trim area **anisotropically** (independent `sx`, `sy`) so the new TrimBox is exactly the target size (A4 = 210 × 297 mm). The A5→A4 difference is ~0.3 %, visually undetectable.
  - Emit fixed boxes: TrimBox = 210 × 297, BleedBox/MediaBox = trim + 3 mm all round → 216 × 303 mm.
- When the source has **no** bleed: unchanged — proportional fit of the MediaBox onto the target (A5 ↔ A4 up or down).

In `production_tasks.assemble_print_ready_for_job`, pass `target_bleed_mm=min(target.bleed_mm or 3.0, 3.0)` on the resize call whenever `source_has_trim` is true, and record the step as `resize:210x297+3mm bleed` so the processing chain shows it.

---

## 2 & 3. Per-component imposition

Assembly already emits one print-ready PDF per component (`assembly_report.components`, e.g. `250gsm silk cover` + `Body`), but imposition only ever reads `order_jobs.print_ready_pdf_path` (the first component) and stores one `imposed_pdf_path`. Hence only the cover gets imposed.

**Database** — new migration on `order_jobs`:
- `imposed_components jsonb not null default '[]'` — `[{component, label, template_id, storage_path, imposed_at, n_up}]`
- `imposition_templates_by_component jsonb not null default '{}'` — operator's per-component template choice.

**pdf-server**
- `JobArtefactRequest` gains optional `component: str | None`.
- `/v1/operations/assemble-imposed-sheet` persists `imposition_templates_by_component[component] = template_id` when a component is supplied.
- `assemble_imposed_sheet_for_job(job_id, pdf_job_id, component=None)`:
  - Resolve the source PDF from `assembly_report.components` matching `component` (falling back to `print_ready_pdf_path` for single-component jobs).
  - Resolve the template from `imposition_templates_by_component[component]`, falling back to `imposition_template_id`.
  - Upload to `production/imposed/{job_number}-{component}.pdf` and upsert the entry into `imposed_components`; also keep writing `imposed_pdf_path` for the first/only component so existing screens keep working.

**Edge function `production-pdf`**
- Accept and forward `component`; when present, merge the returned path into `imposed_components` instead of overwriting `imposed_pdf_path`.

**Admin UI — `ProductionPanel.tsx`**
- Single-component jobs: unchanged.
- Multi-component jobs: replace the single imposition block with one card per component (Cover, Body, …), each showing:
  - the component name, part count and its print-ready download,
  - its own template `Select` (same size-match highlighting and mismatch warning as today, defaulted per component),
  - its own **Impose** button and **Imposed sheet** download row backed by `imposed_components`.
- Job-size chip stays at the top of the imposition section.
- `useProductionArtefacts` gains `imposed_components` / `imposition_templates_by_component` in its select plus a `generateImposition(templateId, component?)` signature.

---

## Technical notes

- Anisotropic trim scaling is deliberate and limited to the bleed path; the no-bleed path stays proportional.
- 3 mm is the hard cap for both trimming incoming bleed and generating outgoing bleed.
- Order of work: DB migration → pdf-server (`pdf_ops`, `production_tasks`, route/schema) → edge function → admin UI. pdf-server changes deploy via the existing GitHub Actions → Cloud Run workflow on push to `main`.
