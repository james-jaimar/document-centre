"""Press-ready body pages for perfect-bound books.

Every page leaves on one identical sheet: exact trim, up to 3 mm of the
customer's own bleed (kept when they supplied it, white when they did not),
a waste margin and crop marks at the trim corners. Pages with customer crop
marks are cut back to their bleed so the old marks never print.
"""
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.services.perfect_bound_assembly import (
    WRAP_MARK_GAP_MM, WRAP_MARK_LENGTH_MM, WRAP_MARK_MARGIN_MM, _clip_page,
)

EPS_PT = 1.0


def _source_boxes(page, max_bleed_pt):
    media, trim, bleed = page.mediabox, page.trimbox, page.bleedbox
    has_trim = abs(float(media.width) - float(trim.width)) > EPS_PT or abs(float(media.height) - float(trim.height)) > EPS_PT
    if not has_trim:
        return media, None
    t = [float(trim.left), float(trim.bottom), float(trim.right), float(trim.top)]
    b = [float(bleed.left), float(bleed.bottom), float(bleed.right), float(bleed.top)]
    m = [float(media.left), float(media.bottom), float(media.right), float(media.top)]
    if b == m:  # no explicit BleedBox: assume up to 3 mm around trim
        b = [t[0] - max_bleed_pt, t[1] - max_bleed_pt, t[2] + max_bleed_pt, t[3] + max_bleed_pt]
    clip = [max(m[0], b[0], t[0] - max_bleed_pt), max(m[1], b[1], t[1] - max_bleed_pt),
            min(m[2], b[2], t[2] + max_bleed_pt), min(m[3], b[3], t[3] + max_bleed_pt)]
    return trim, RectangleObject(clip)


def _marks(media_w, media_h, left, bottom, right, top, bleed_mm):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(media_w, media_h))
    c.setLineWidth(0.25)
    c.setStrokeColorCMYK(0, 0, 0, 1)
    offset = (bleed_mm + WRAP_MARK_GAP_MM) * mm
    length = WRAP_MARK_LENGTH_MM * mm
    for x in (left, right):
        c.line(x, bottom - offset - length, x, bottom - offset)
        c.line(x, top + offset, x, top + offset + length)
    for y in (bottom, top):
        c.line(left - offset - length, y, left - offset, y)
        c.line(right + offset, y, right + offset + length, y)
    c.showPage(); c.save()
    return PdfReader(buf).pages[0]


def add_body_press_marks(src: Path, out: Path, width_mm: float, height_mm: float, bleed_mm: float = 3.0) -> dict:
    reader = PdfReader(str(src))
    writer = PdfWriter()
    bleed_pt, margin = bleed_mm * mm, WRAP_MARK_MARGIN_MM * mm
    tw, th = width_mm * mm, height_mm * mm
    media_w, media_h = tw + 2 * (bleed_pt + margin), th + 2 * (bleed_pt + margin)
    left, bottom = margin + bleed_pt, margin + bleed_pt
    marks = None
    with_bleed = 0
    for page in reader.pages:
        page.transfer_rotation_to_content()
        trim, clip = _source_boxes(page, bleed_pt)
        if clip is not None:
            with_bleed += 1
            _clip_page(page, clip)
        else:
            _clip_page(page, trim)
        sx, sy = tw / float(trim.width), th / float(trim.height)
        if abs(sx - sy) > 0.01:  # different proportions: fit, centred
            sx = sy = min(sx, sy)
        ox = left + (tw - float(trim.width) * sx) / 2 - float(trim.left) * sx
        oy = bottom + (th - float(trim.height) * sy) / 2 - float(trim.bottom) * sy
        new = writer.add_blank_page(width=media_w, height=media_h)
        new.merge_transformed_page(page, Transformation().scale(sx, sy).translate(ox, oy))
        if marks is None:
            marks = _marks(media_w, media_h, left, bottom, left + tw, bottom + th, bleed_mm)
        new.merge_page(marks)
        new.mediabox = RectangleObject([0, 0, media_w, media_h])
        new.cropbox = RectangleObject([0, 0, media_w, media_h])
        new.bleedbox = RectangleObject([margin, margin, media_w - margin, media_h - margin])
        new.trimbox = RectangleObject([left, bottom, left + tw, bottom + th])
    with open(out, "wb") as f:
        writer.write(f)
    return {"pages": len(reader.pages), "pages_with_source_bleed": with_bleed}
