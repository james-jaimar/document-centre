# Imposition worker — implementation spec

This document describes what the `/v1/operations/assemble-imposed-sheet`
endpoint must do once `imposition_template_id` is included in the request
payload from the `production-pdf` Supabase Edge Function.

## Request payload (already wired from Lovable side)

```json
{ "job_id": "<uuid>", "imposition_template_id": "<uuid>" }
```

## Behaviour

1. Read `order_jobs` row for `job_id`. Require `print_ready_pdf_path` set.
2. Read `imposition_templates` row for `imposition_template_id`:
   - `template_pdf_path` (storage bucket: `imposition-templates`)
   - `slots` (jsonb array): `[{index, x_mm, y_mm, width_mm, height_mm, rotation_deg}]`
   - `output_width_mm`, `output_height_mm`, `n_up`
3. Download both PDFs to local temp via service-role Supabase storage.
4. With `pikepdf`:
   - Open print-ready (customer pages) and template (single press-sheet page).
   - Walk customer pages in chunks of `n_up`.
   - For each chunk, clone the template page, then for each customer page in
     the chunk use `Page.add_overlay(other_page, rect)` with a transformation
     matrix that scales the customer page to `slot.width_mm × slot.height_mm`,
     translates to `(slot.x_mm, slot.y_mm)` measured from bottom-left in
     points (1 mm = 2.83465 pt), and rotates by `slot.rotation_deg` around
     the slot centre.
   - Append the composite page to the output PDF.
5. Save composite to `documents/imposed/{job_id}.pdf` via service-role upload.
6. `UPDATE order_jobs SET imposed_pdf_path = '...', imposition_n_up = <n_up>
   WHERE id = job_id`.
7. Return `{ "storage_path": "..." }` to the polling edge function.

## Notes / future

- Crop marks and colour bars are part of the uploaded template artwork itself
  this round (no procedural generation).
- Saddle-stitch / booklet imposition (page reordering: 1+last, 2+second-last)
  is NOT covered here — separate worker.
- The template PDF lives in a private bucket (`imposition-templates`) — the
  worker must use service-role credentials to download.
