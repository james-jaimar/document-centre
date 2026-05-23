# Gutter-aware crop marks for n-up imposition

## Problem

Current `impose_nup_trimbox` in `pdf-server/app/services/pdf_ops.py` suppresses **all** interior crop marks (the previous fix). That matches Acrobat's behaviour only when the gutter is 0 AND no tick is wanted. The reference Acrobat plugin actually does this:

- **Gutter = 0** — one short tick on the shared cut line (indicates where to guillotine).
- **Gutter > 0** — two marks per interior boundary, one on each side of the gutter, indicating the trim edge of each adjacent slot.
- **Outer edges** — full-length marks extending outward into the waste (unchanged).

Our current screenshot (image 3) shows: vertical interior marks correctly suppressed, but horizontal interior marks still present and extending outward through the gutter — because the suppression logic only kills marks on the slot's *own* interior edge for the axis where that slot has a neighbour on that side. The fix needs to be redone around gutter geometry, not just edge position.

## Fix

Single edit in `pdf-server/app/services/pdf_ops.py`, inside the `if show_crop_marks:` block of `impose_nup_trimbox` (lines ~1978-2013).

Replace the current per-slot, per-corner unconditional draws with logic that, for each of the 4 slot edges, picks one of three modes:

1. **Outer edge** (no neighbour on that side): existing behaviour — mark starts at `cm_off` from the trim corner and extends `cm_len` outward.
2. **Interior edge, gutter > 0**: mark starts at the trim corner and extends *into* the gutter. Length = `min(cm_len, gutter/2)`. No `cm_off` (the mark touches the trim corner so the operator can line up the guillotine on it). Drawn by every slot that has that interior edge — naturally produces the two-marks-per-gutter pattern in image 2.
3. **Interior edge, gutter == 0**: a single short tick (e.g. `min(cm_len, 2mm)`) centred on the shared cut line, drawn **once per shared line** to avoid double-stroking. Deduplicate by only drawing it from the slot on the lower-col / lower-row side (i.e. `is_right` for vertical shared lines, `is_top` for horizontal shared lines, where "lower" is the slot whose `tx1`/`ty1` equals the cut line).

The 8 line segments stay the same; only their start/end and the gate change. Concretely, for each slot compute `col`, `row`, `is_left`, `is_right`, `is_top`, `is_bottom` as today, then for each edge pick the mode above and emit the two corner segments along that edge.

## Out of scope

- No DB / schema / UI changes. The `has_crop_marks` boolean on `imposition_templates` still gates the whole block.
- No changes to `impose_with_template`, `booklet_saddle_stitch`, registration marks, or colour bars.
- Gutter value already arrives via the template (`gutter_mm` → `gutter`) — no new field needed.

## Deploy & verify

```
cd /opt/document-centre-api && git pull
sudo systemctl restart document-centre-worker-heavy
```

Then in the admin UI:

1. Re-impose `INV-00059-1` with the existing "2-up A3, no bleed" template (gutter currently 0) and confirm in Acrobat we see a single short tick on the shared vertical cut line — matching image 1.
2. Edit that template to `gutter_mm = 5`, re-impose, and confirm two short marks bracket the gutter top & bottom — matching image 2.
3. Confirm outer marks at the 4 sheet corners are unchanged in both cases.
