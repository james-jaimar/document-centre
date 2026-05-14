# Plan: Template-driven imposition in pdf-server

## Goal

Wire the platform-managed imposition templates (already created in Lovable + Supabase) into the actual VPS worker so that when an operator picks a template and clicks **Impose**, the print-ready PDF gets overlaid onto the admin's uploaded press-sheet template (with bleed + crops baked in by the artwork) and saved as `order_jobs.imposed_pdf_path`.

The Edge Function `production-pdf` and admin UI are already done. This round only changes `pdf-server/`.

## What's already in place (do not touch)

- `JobArtefactRequest` schema (`job_id: UUID`) — extend, don't replace
- Endpoint `/v1/operations/assemble-imposed-sheet` and Celery task `assemble_imposed_sheet_for_job` — extend, don't replace
- Legacy strategy logic (`_imposition_strategy`, `pdf_ops.impose_sheet_with_bleed`, `pdf_ops.booklet`) — keep as fallback when no template id is supplied
- `production_orchestrator.write_artefact_path` / `load_job_bundle` — reuse
- `StorageService` (handles Supabase storage download/upload via service-role)
- The DB column `order_jobs.imposition_template_id` — already populated by the edge function before the worker runs

## Changes

### 1. Schema (`pdf-server/app/schemas/assets.py`)

Extend `JobArtefactRequest`:

```python
class JobArtefactRequest(BaseModel):
    job_id: UUID
    imposition_template_id: UUID | None = None
```

The edge function already sends this field; making it optional keeps the print-ready and ticket endpoints unaffected.

### 2. New service (`pdf-server/app/services/imposition_templates.py`)

Single module that:

- Loads `imposition_templates` row from Supabase by id (uses the same `_client()` pattern as `production_orchestrator`)
- Returns a typed `ImpositionTemplate` dataclass with: `template_pdf_path`, `n_up`, `slots: list[Slot]`, `output_width_mm`, `output_height_mm`, `has_crop_marks`, `work_style`
- `Slot` = `(index, x_mm, y_mm, width_mm, height_mm, rotation_deg)`
- Validates: `n_up == len(slots)`, `n_up >= 1`, all numeric fields present
- Downloads the template PDF from the private `imposition-templates` bucket to a local `Path` (caller passes the `Workspace`)

### 3. New worker helper (`pdf-server/app/services/pdf_ops.py`)

Add one method on `pdf_ops`:

```python
def impose_with_template(
    self,
    source_pdf: Path,
    template_pdf: Path,
    slots: list[Slot],
    n_up: int,
    output_pdf: Path,
) -> int:
    """Stamp customer pages onto a press-sheet template.

    Returns the number of composite sheets produced.
    """
```

Implementation outline (pikepdf):

1. Open `source_pdf` (customer pages) and `template_pdf` (single-page artwork containing crop marks, colour bars, registration).
2. Iterate customer pages in chunks of `n_up`. For each chunk:
   - Clone the template page into a fresh `pikepdf.Pdf` output.
   - For each customer page in the chunk, look up `slot = slots[i % n_up]`.
   - Call `Page.add_overlay(customer_page, pikepdf.Rectangle(x0, y0, x1, y1))` where the rectangle is the slot in **PDF points** (mm × 2.83465), origin bottom-left of the press sheet.
   - For `rotation_deg`, build a `pikepdf.Matrix` that rotates around the slot centre and pre-applies it via the `add_overlay` `transform=` argument (pikepdf 9 supports this).
3. Save composite to `output_pdf`. Return composite page count.

If the final chunk is partial (customer page count not divisible by `n_up`), leave unused slots blank — do not auto-rotate or auto-tile. (We can revisit work-and-turn later; this round is `cut_sheet` only.)

### 4. Wire into the existing Celery task (`pdf-server/app/tasks/production_tasks.py`)

In `assemble_imposed_sheet_for_job`, after loading the bundle, branch:

```python
template_id = (bundle.job.get("imposition_template_id"))
if template_id:
    template = load_imposition_template(template_id, ws)
    pdf_ops.impose_with_template(src, template.local_pdf, template.slots, template.n_up, out_pdf)
    result = {
        "storage_path": storage_path,
        "strategy": "template",
        "template_id": str(template_id),
        "n_up": template.n_up,
    }
    # also persist imposition_n_up on the job via write_artefact_path-equivalent
else:
    # … existing legacy nup / booklet / none branch unchanged
```

Add a new orchestrator helper `write_job_field(job_id, column, value)` constrained to a small allow-list (`imposition_template_id`, `imposition_n_up`) to avoid open-ended writes.

### 5. Endpoint passthrough (`pdf-server/app/web/routes.py`)

The endpoint signature already takes `JobArtefactRequest`. With the schema change above, FastAPI will accept the new optional field automatically. We persist it on the job before kicking off the task so the worker can read it from `order_jobs` on reload (the edge function also writes it — defence in depth):

```python
if payload.imposition_template_id:
    sb.table("order_jobs").update(
        {"imposition_template_id": str(payload.imposition_template_id)}
    ).eq("id", str(payload.job_id)).execute()
```

### 6. No DB migration on the VPS side

Schema lives in Supabase; pdf-server reads it via the service-role client. Nothing to install.

## Out of scope (next round)

- Saddle-stitch booklet imposition with template (still uses legacy `pdf_ops.booklet`)
- `work_and_turn` / `sheetwise` page-ordering rules (treated as `cut_sheet` for now)
- Procedural crop marks / colour bars (template artwork is the source of truth)
- Auto-pick template from branch press

## Verification

After `git pull` + `systemctl restart document-centre-worker-heavy`:

1. Upload a 2-up A4-on-SRA3 template via `/platform/imposition` with two slots at `(8, 8, 210, 297)` and `(218, 8, 210, 297)`.
2. Assign it as primary to the "Flyers A4" product family.
3. As an operator, open a flyer job with 4 customer pages, click **Assemble Print-Ready**, then **Impose** with the template selected.
4. Confirm:
   - `order_jobs.imposed_pdf_path` populated, `imposition_n_up = 2`
   - Downloaded PDF is 2 SRA3 pages, each containing 2 A4 customer pages on top of the template's crop marks
   - Visual QA: convert with `pdftoppm -r 150` and inspect for slot alignment, no clipping, marks visible

## Files to touch

- `pdf-server/app/schemas/assets.py` (1 field)
- `pdf-server/app/services/imposition_templates.py` (new, ~80 lines)
- `pdf-server/app/services/pdf_ops.py` (1 new method, ~60 lines)
- `pdf-server/app/services/production_orchestrator.py` (extend write helper allow-list)
- `pdf-server/app/tasks/production_tasks.py` (template branch in existing task)
- `pdf-server/app/web/routes.py` (defensive job update — optional)
- `pdf-server/docs/IMPOSITION_WORKER_SPEC.md` → mark as **implemented**, link to code

No `requirements.txt` change — `pikepdf 9.4.2` already pinned and supports `Page.add_overlay(..., transform=...)`.
