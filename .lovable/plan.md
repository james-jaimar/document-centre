# Imposition fixes: copies mode + honour crop-marks toggle

Two small, focused fixes in the pdf-server imposition path. No DB changes, no UI changes.

## 1. Copies-per-sheet (not sequential pages)

Today `impose_nup_trimbox` walks the source pages and drops them into slots in order — so a 2-up A3 of a 2-page document produces one sheet with page 1 on the left and page 2 on the right.

You want: **each source page becomes its own sheet, repeated N times** (N = `columns × rows`). So:
- 1-page document, 2-up A3 → 1 sheet, page 1 ×2
- 2-page document, 2-up A3 → 2 sheets (sheet A: page 1 ×2, sheet B: page 2 ×2)
- 4-page document, 4-up A3 → 4 sheets, one per page, each page ×4

This matches the standard print-shop meaning of "n-up imposition" for run-length copies.

**Change** in `pdf-server/app/services/pdf_ops.py › impose_nup_trimbox`:
- Replace the `for chunk_start in range(0, len(customer_pages), per_sheet)` loop with `for src_idx, cust in enumerate(customer_pages)`.
- For each source page, create one sheet and stamp the same page into all `per_sheet` slot rectangles.
- Stats `sheet_count` then equals `len(customer_pages)`.

## 2. Honour the "crop marks" toggle from the template

The `has_crop_marks` flag is loaded from the template row and stored on `ImpositionTemplate`, but it is never passed into `impose_nup_trimbox`, which unconditionally draws crop marks at every slot's trim corners. That's why your "A4 2up A3 No bleed" template still shows marks.

**Changes**:
- `pdf-server/app/services/pdf_ops.py › impose_nup_trimbox`: add `show_crop_marks: bool = True` kwarg; wrap the crop-mark drawing block (lines ~1976–1994) in `if show_crop_marks:`. Registration marks stay gated on the existing `show_registration` flag.
- `pdf-server/app/tasks/production_tasks.py` (line ~435 call site): pass `show_crop_marks=template.has_crop_marks`.

## Out of scope

- No change to `impose_with_template` (slot-PDF templates) or `booklet_saddle_stitch` — booklet imposition genuinely needs sequential pages.
- No DB / schema / admin-UI change. The existing `has_crop_marks` column and the slider that drives it already exist; we are just wiring them through.

## Deploy

```
cd /opt/document-centre-api && git pull
sudo systemctl restart document-centre-worker-heavy
```

Then re-impose `INV-00059-1` and confirm: 1 sheet output, 2 copies of page 1, no crop marks.
