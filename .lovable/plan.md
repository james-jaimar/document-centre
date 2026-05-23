## What is failing now

The latest production failure is no longer the old deployment/tolerance issue. The worker picked up the new code and now reports the real overflow:

```text
Imposed block (420.003×297.000mm + 3.0mm bleed) does not fit on press sheet (420.0×297.0mm).
Overflow: width=6.003mm, height=6.000mm
```

For `INV-00059-1`, the assigned template is:

```text
A4 2up A3 No bleed
kind=parametric_nup
columns=2, rows=1
output=420×297mm
bleed_mm=0.00
crop_mark_offset_mm=3.00
```

The bug is in `load_imposition_template()`: it loads numeric fields using `row.get("bleed_mm") or 3.0`. Because `0.00` is falsy in Python, a valid no-bleed template becomes `bleed_mm=3.0`, adding 3mm around the block and causing a 6mm overflow.

## Plan

1. Fix numeric default handling in `pdf-server/app/services/imposition_templates.py`
   - Preserve explicit `0` values for:
     - `bleed_mm`
     - `gutter_mm`
     - `crop_mark_offset_mm`
     - `crop_mark_length_mm`
     - `creep_per_sheet_mm`
     - `fallback_trim_inset_mm`
   - Only use defaults when the database value is actually `NULL` or missing.

2. Add a small local helper in the loader
   - Something like `num(row, "bleed_mm", 3.0)` so this class of bug does not recur.
   - Apply it consistently to both `parametric_nup` and `parametric_booklet` paths.

3. Keep the existing fit tolerance/clamping in `pdf_ops.py`
   - It is still needed for the remaining `420.003mm` micro-overflow from PDF A4 rounding.
   - With `bleed_mm=0`, the current tolerance should allow `INV-00059-1` to impose.

4. Verify after deployment/retry
   - Re-run imposition for `INV-00059-1` / job `3266f54a-55b9-495d-9ed3-fee4061ad9ee`.
   - Confirm the newest `assemble_imposed_sheet` job is `completed` and `order_jobs.imposed_pdf_path` is populated.

## Deployment note

This is VPS worker code, so after merging it needs:

```bash
cd /opt/document-centre-api && git pull
sudo systemctl restart document-centre-worker-heavy
```

Then retry imposition from the admin order screen.