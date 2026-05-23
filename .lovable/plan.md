# Suppress interior crop marks at gutter join lines

## Background

Crop marks are drawn entirely by our own code in `impose_nup_trimbox` (ReportLab `canvas.line`) — there is no third-party imposition library whose parameters we could tweak. Each slot currently gets all 8 mark segments (2 at each corner) drawn unconditionally. When two slots meet across a gutter, the marks pointing inward end up sitting on or right next to the shared cut line — which is exactly what the user is flagging in Acrobat.

Standard prepress practice is to only draw crop marks for **cuts that land on the outer edge of the press sheet**. Marks at interior slot edges (i.e. inside the gutter between two slots) must be suppressed.

## Change

Single, narrow edit in `pdf-server/app/services/pdf_ops.py`, inside the `if show_crop_marks:` block of `impose_nup_trimbox` (around lines 1978–1994).

For each slot, compute:

```
col = slot_idx % columns
row = slot_idx // columns
is_left   = (col == 0)
is_right  = (col == columns - 1)
is_top    = (row == 0)            # row 0 is the TOP row (ty0 uses rows-1-row)
is_bottom = (row == rows - 1)
```

Then gate each of the 8 line segments by which slot edge it belongs to:

- **bottom-left corner**
  - horizontal segment (extends left of `tx0` at `y=ty0`) → draw only if `is_bottom`
  - vertical segment   (extends below `ty0` at `x=tx0`) → draw only if `is_left`
- **bottom-right corner**
  - horizontal (extends right of `tx1` at `y=ty0`) → draw only if `is_bottom`
  - vertical   (extends below `ty0` at `x=tx1`) → draw only if `is_right`
- **top-left corner**
  - horizontal (extends left of `tx0` at `y=ty1`) → draw only if `is_top`
  - vertical   (extends above `ty1` at `x=tx0`) → draw only if `is_left`
- **top-right corner**
  - horizontal (extends right of `tx1` at `y=ty1`) → draw only if `is_top`
  - vertical   (extends above `ty1` at `x=tx1`) → draw only if `is_right`

Net effect:
- 1-up: unchanged (all four corners are outer).
- 2-up A3 (your `INV-00059-1` case, 2 cols × 1 row): the two vertical marks pointing *into* the gutter at the inner edges of each slot disappear; outer L/R verticals and all top/bottom horizontals stay.
- 4-up (2×2): horizontals along the central horizontal cut and verticals along the central vertical cut are both suppressed; only the marks around the outside of the 2×2 block remain.

## Out of scope

- No DB / schema / UI changes. This is industry-standard prepress behaviour, not a per-template toggle. The existing `has_crop_marks` flag on `imposition_templates` continues to gate the whole block.
- No change to `impose_with_template` (admin-uploaded press-sheet PDFs already bake marks in) or `booklet_saddle_stitch`.
- No change to `show_registration` / colour-bar logic.

## Deployment

After merging on the API host:

```
cd /opt/document-centre-api
git pull
sudo systemctl restart document-centre-worker-heavy
```

Then re-impose `INV-00059-1` (A4 2-up A3 No bleed) and confirm in Acrobat that the two crop marks previously sitting next to the central gutter are gone, while the outer marks at the four corners of each slot remain.
