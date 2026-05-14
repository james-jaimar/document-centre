# Imposition worker — IMPLEMENTED ✅

This was the original spec. The behaviour described below is now live:

- **Endpoint**: `POST /v1/operations/assemble-imposed-sheet` in
  `pdf-server/app/web/routes.py`
- **Schema**: `JobArtefactRequest.imposition_template_id` (optional UUID) in
  `pdf-server/app/schemas/assets.py`
- **Template loader**: `pdf-server/app/services/imposition_templates.py` —
  reads `imposition_templates` rows + downloads the template PDF from the
  private `imposition-templates` Supabase Storage bucket via service-role.
- **Imposition core**: `PdfOps.impose_with_template()` in
  `pdf-server/app/services/pdf_ops.py` — pikepdf overlay onto the cloned
  template page, mm→pt conversion, optional rotation around slot centre.
- **Celery task**: `assemble_imposed_sheet_for_job` in
  `pdf-server/app/tasks/production_tasks.py` — branches into the template
  path when `order_jobs.imposition_template_id` is set, else falls back to
  the legacy product-aware strategy.

## Out of scope (next round)

- Saddle-stitch booklet imposition driven by template (still uses
  `pdf_ops.booklet`).
- `work_and_turn` / `sheetwise` page-ordering rules — currently treated as
  `cut_sheet`.
- Procedural crop marks / colour bars — the uploaded template artwork is the
  source of truth.
- Auto-pick template from branch press.

## Original request payload (still valid)

```json
{ "job_id": "<uuid>", "imposition_template_id": "<uuid>" }
```
