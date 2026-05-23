## What's happening

INV-00059-1 (Bound Documents, A4) is being imposed with your template **"A4 2up A3 No bleed"** (kind `parametric_nup`, 2×1, 420×297mm, bleed 0, gutter 0).

Print-ready assembly succeeded. Imposition failed on the pdf-server worker with:

```
ValueError: Imposed block (420.0×297.0mm + bleed) does not fit on
press sheet (420.0×297.0mm).
```

### Root cause

In `pdf-server/app/services/pdf_ops.py::impose_nup_trimbox` (line 1892) the fit check is a strict `>`:

```python
if block_w + 2 * bleed > sheet_w or block_h + 2 * bleed > sheet_h:
    raise ValueError(...)
```

The prepared PDF's reported page size is `210.0015555×297.0000833 mm` (logged from the `assemble_print_ready` result for this job — almost certainly originating from A4 expressed as 595.275591pt, round-tripped through the box ladder). Two columns at that trim width give a block width of ~420.003mm, which is greater than the 420mm sheet by 3 µm and trips the strict comparison. The print message rounds to `420.0×297.0` so it looks identical.

This will break **any** "exact-fit" template (A4→A3 2-up, A5→A4 2-up, A3→SRA3 with 0 bleed, etc.) — exactly the templates you'd most expect to work.

## Fix

One small change in `pdf-server/app/services/pdf_ops.py` only. No DB, no edge function, no frontend changes.

Add a 0.5 mm tolerance to the fit check (industry-standard rounding allowance, well below any cutter precision):

```python
TOL = 0.5 * MM  # 0.5 mm tolerance for sub-mm box rounding
if (block_w + 2 * bleed) > (sheet_w + TOL) \
   or (block_h + 2 * bleed) > (sheet_h + TOL):
    raise ValueError(
        f"Imposed block ({block_w/MM:.2f}×{block_h/MM:.2f}mm + bleed) "
        f"does not fit on press sheet ({sheet_width_mm}×{sheet_height_mm}mm)."
    )
```

Also bump the error message precision from `.1f` to `.2f` so the next time someone hits a genuine overflow, the µm-level cause is visible instead of two identical-looking numbers.

`origin_x` / `origin_y` centring math is unchanged — a 3 µm overage centres at `-1.5 µm`, which clips invisibly off the sheet edge and is fine.

## Out of scope (deliberately)

- No template edits, no schema migrations.
- No change to the legacy fallback path (it uses computed `cols/rows` from sheet, so it can never overflow).
- No change to `booklet_saddle_stitch` (different code path, not affected).

## Verification after `git pull` + worker restart

1. Re-trigger imposition on INV-00059-1 — should produce an `imposed_pdf_path` on the A3 sheet.
2. Sanity check a deliberately oversized template (e.g. A4 2-up on A4) — must still raise `ValueError` with the new `.2f` message.

## You apply on the VPS

I'll only edit `pdf-server/app/services/pdf_ops.py`. You then `git pull` and restart the heavy worker (`document-centre-worker-heavy`) — the FastAPI process does not need to restart for this change.
