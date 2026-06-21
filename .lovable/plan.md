# Fix: imposition engine silently drops source bleed (audit + fix)

## Root cause (verified against `Ady_Bus_Card_-_Talking_Dog_-_July_2021_FA.pdf`)

Your card has correct boxes:

```
MediaBox  104.8 x 69.8 mm   (full sheet incl. crop marks)
BleedBox   96.0 x 61.0 mm   (trim + 3 mm bleed)
TrimBox    90.0 x 55.0 mm   (cut line)
```

In `pdf-server/app/services/pdf_ops.py` the imposition routines temporarily set `page.MediaBox = <some rect>` and then call `pikepdf.Page.add_overlay`. The mistaken assumption is that swapping MediaBox forces the form XObject's drawable rectangle (`/BBox`). It does not — qpdf's `as_form_xobject()` picks the BBox using the order **TrimBox → CropBox → MediaBox**, so TrimBox always wins when present. I confirmed this by running it directly against your file:

```
new MediaBox        : [12.50, 12.50, 284.62, 185.41]   <- our bleed rect
CropBox             : [0,     0,     297.12, 197.91]   <- untouched
FormXObject /BBox   : [21.0,  21.0,  276.12, 176.91]   <- TrimBox!
```

Result for the BC case: qpdf draws only the 90 x 55 mm trim rectangle into each slot, and `calc_form_xobject_placement` stretches that 90 x 55 area to fill the 96 x 61 mm slot-plus-bleed target rectangle. The original trim edge ends up at the new bleed edge — exactly what you saw with "Photography" sitting on the cut line.

## Audit of every place this pattern occurs

| # | Function (file `pdf_ops.py`) | Used by | Symptom today |
|---|---|---|---|
| 1 | `impose_nup_trimbox` (~L2985-3013) | Cut-sheet products: Business Cards, Flyers, Postcards, Cards, Leaflets, Loose Sheets — anything routed through the `nup` strategy | **Stretches trim to fill the slot-plus-bleed rectangle** (the bug you reported). |
| 2 | `impose_with_template` (~L2786-2820) | Any product with a customer-uploaded press-sheet template (Business Cards 21-up SRA3, your 90x55 / 85x55 / 90x50 templates, plus future user-defined templates) | Calls `sheet.add_overlay(cust_page, slot_rect)` with `slot_rect` sized to the slot **trim**. qpdf uses TrimBox as BBox, so the trim maps 1:1 into the slot but **all source bleed is clipped away** — the operator gets no bleed at all in the gutters between slots, so any cutting drift will leave a thin sliver of unprinted sheet on every card. |
| 3 | `booklet_saddle_stitch._place` (~L3181-3207) | Saddle-stitch products: brochures, programmes, anything routed through the `booklet` strategy | Sets `page.MediaBox = trim` then `add_overlay`. The MediaBox swap is a no-op because qpdf picks TrimBox anyway, so the page's trim is placed scaled into the half-sheet but **the customer's bleed is dropped** — bad for flood-colour booklets where the outer edge needs bleed. |

Three other `add_overlay` call sites use reportlab-generated crop-mark overlays (no TrimBox on the source) — not affected. All `merge_transformed_page` calls go through pypdf (which honours MediaBox directly) — not affected.

## Fix — single helper, applied at all three sites

Add one private helper on `PdfOps`:

```python
@staticmethod
def _place_with_bleed(target_page, source_page, *,
                      source_rect: list[float],
                      target_rect: pikepdf.Rectangle) -> None:
    """Overlay `source_page` onto `target_page` so that `source_rect`
    (in source-page user space) maps to `target_rect` on the target.

    Bypasses qpdf's TrimBox-first BBox selection by overriding the
    form XObject's /BBox explicitly. `source_rect` and `target_rect`
    must share the same aspect ratio; the caller picks whichever
    source rectangle it wants drawn (trim, bleed, or media)."""
    formx = source_page.as_form_xobject()
    formx.BBox = pikepdf.Array(source_rect)
    formx.Matrix = pikepdf.Array([1, 0, 0, 1, 0, 0])
    name = target_page.add_resource(formx, pikepdf.Name.XObject)
    sx = target_rect.width  / (source_rect[2] - source_rect[0])
    sy = target_rect.height / (source_rect[3] - source_rect[1])
    ox = target_rect.llx - source_rect[0] * sx
    oy = target_rect.lly - source_rect[1] * sy
    cs = f"q {sx} 0 0 {sy} {ox} {oy} cm /{name} Do Q\n".encode()
    target_page.contents_add(cs)
```

### Site 1 — `impose_nup_trimbox`

Replace the MediaBox-swap block (lines ~2987-3013) with one call per slot:

```python
trim = self._resolve_trim_box(cust, fallback_inset)
mb = list(map(float, cust.MediaBox))
cust_bleed = [
    max(mb[0], trim[0] - bleed),
    max(mb[1], trim[1] - bleed),
    min(mb[2], trim[2] + bleed),
    min(mb[3], trim[3] + bleed),
]
for slot_idx in range(per_sheet):
    tx0, ty0, tx1, ty1 = slot_rects[slot_idx]
    self._place_with_bleed(
        sheet, cust,
        source_rect=cust_bleed,
        target_rect=pikepdf.Rectangle(tx0 - bleed, ty0 - bleed,
                                      tx1 + bleed, ty1 + bleed),
    )
```

Now the source bleed region maps 1:1 into the slot-plus-bleed area; the trim line is preserved.

### Site 2 — `impose_with_template`

Each slot's `rect` is the slot **trim** rectangle. Compute a per-slot bleed extension using the template's `bleed_mm` (already on the template config) and grow both rectangles symmetrically. Because templates already include gutters/registration around each slot, the source bleed flows naturally into those gutters (which is exactly what a press-sheet template is designed for):

```python
trim_src = self._resolve_trim_box(cust_page, fallback_inset=0)
mb = list(map(float, cust_page.MediaBox))
cust_bleed_src = [
    max(mb[0], trim_src[0] - tpl_bleed_pt),
    max(mb[1], trim_src[1] - tpl_bleed_pt),
    min(mb[2], trim_src[2] + tpl_bleed_pt),
    min(mb[3], trim_src[3] + tpl_bleed_pt),
]
tgt_rect = pikepdf.Rectangle(
    x0 - tpl_bleed_pt, y0 - tpl_bleed_pt,
    x1 + tpl_bleed_pt, y1 + tpl_bleed_pt,
)
self._place_with_bleed(sheet, cust_page,
                       source_rect=cust_bleed_src,
                       target_rect=tgt_rect)
```

For the rotated-slot branch, multiply the placement matrix by the existing rotation matrix instead of using `add_overlay(... transform=)`. Template bleed defaults to 3 mm (already in the schema as `bleed_mm`); when `bleed_mm == 0` the call collapses to the current trim-only behaviour, so trim-only templates continue to render unchanged.

### Site 3 — `booklet_saddle_stitch._place`

Same swap. Use `tpl_bleed = bleed_mm * MM` (already in scope), grow source-trim to source-bleed, grow target-half-sheet placement by the same margin on the outer edges only (spine edge stays at half-width — bleed there would print onto the facing page). Falls back to current behaviour when `bleed_mm == 0`.

## Out of scope

- No DB / migration / frontend changes.
- No change to `assemble_print_ready` — your BC file already passes through it untouched.
- No change to reportlab crop-mark overlay calls (not affected).
- Perfect-bound / PUR / wire-o imposition (already listed as future work in `IMPOSITION_WORKER_SPEC.md`).

## Verification

1. **BC regression (your file).** Re-run impose. In Acrobat at 200%: "Photography" must sit ~3 mm in from the slot trim line; the photo background must extend ~3 mm past the trim into the gutter; per-slot `/TrimBox` unchanged at 90 x 55 mm.
2. **Template path.** Run a 21-up Business Cards (90 x 55) job through the template engine; each card slot should now show bleed flowing into the inter-slot gutters; cut sheet should still show identical crop marks (template-owned, untouched).
3. **No-bleed regression.** Submit an A4 letterhead PDF with `TrimBox == MediaBox` through both `impose_nup_trimbox` and `impose_with_template`; output must match current behaviour byte-for-trim (centred, no scaling, no missing edges).
4. **Saddle-stitch.** Submit a flood-colour A5 brochure (TrimBox 148 x 210, 3 mm bleed) and confirm the outer head/foot/fore-edge of each half-sheet now carries the source bleed; spine edges remain flush at the half-sheet centreline.
5. Add one pytest in `pdf-server/tests` that opens your uploaded BC PDF, runs `impose_nup_trimbox` 21-up onto SRA3, and asserts pixel sampling at (slot trim_left + 1mm, slot trim_bottom + 1mm) is white (background bled) AND pixel sampling at the trim-line position matches the source's pixel at the same offset from its trim line (no stretching).
