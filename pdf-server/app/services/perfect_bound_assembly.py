"""Vector perfect-bound wrap compositor. Sources come only from frozen job assets."""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import math
import re

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm


def _number(value, low, high, label):
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"Invalid {label}")
    return number


def _cmyk(hex_colour):
    if not isinstance(hex_colour, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", hex_colour):
        raise ValueError("Invalid spine colour")
    r, g, b = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    k = 1 - max(r, g, b)
    if k == 1:
        return 0, 0, 0, 1
    return (1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k


def compose_perfect_bound_wrap(cover: dict, sources: dict[str, Path], output: Path):
    """Produce back + spine + front, with fixed bleed and PDF box boundaries."""
    trim = cover.get("trim") or {}
    w = _number(trim.get("widthMm"), 40, 500, "trim width")
    h = _number(trim.get("heightMm"), 40, 700, "trim height")
    spine = _number((cover.get("spine") or {}).get("spineMm"), 2, 100, "spine width")
    bleed = _number(cover.get("bleed_mm", 3), 3, 3, "bleed")
    tw, th = (2 * w + spine + 2 * bleed) * mm, (h + 2 * bleed) * mm
    warnings = []

    def page_for(side):
        source = cover.get(side) or {}
        if side not in sources:
            raise ValueError(f"Missing {side} cover PDF")
        page_index = source.get("page")
        if not isinstance(page_index, int) or isinstance(page_index, bool) or page_index < 0:
            raise ValueError("Invalid cover page")
        reader = PdfReader(str(sources[side]))
        if page_index >= len(reader.pages):
            raise ValueError("Cover page is out of range")
        page = deepcopy(reader.pages[page_index])
        page.transfer_rotation_to_content()
        return page

    writer = PdfWriter()
    if cover.get("mode") == "wrap":
        page = page_for("wrap")
        box = page.mediabox
        if abs(float(box.width) - tw) > mm or abs(float(box.height) - th) > mm:
            raise ValueError("Designer wrap dimensions no longer match the text block")
        page.add_transformation(Transformation().translate(-float(box.left), -float(box.bottom)))
        page.mediabox = RectangleObject([0, 0, tw, th])
        writer.add_page(page)
    elif cover.get("mode") == "guided":
        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=(tw, th))
        c.setFillColorCMYK(*_cmyk(cover.get("spine_colour")))
        c.rect(0, 0, tw, th, fill=1, stroke=0)
        if spine >= 4:
            title = str(cover.get("title") or "")[:120]
            author = str(cover.get("author") or "")[:100]
            text = " - ".join(part for part in (title, author) if part)
            if text:
                font_size = min(14, spine * mm * .55)
                from reportlab.pdfbase.pdfmetrics import stringWidth
                font_size = min(font_size, (h - 20) * mm * font_size / max(1, stringWidth(text, "Helvetica", font_size)))
                c.saveState()
                c.translate((bleed + w + spine / 2) * mm, (bleed + h / 2) * mm)
                c.rotate(-90)
                c.setFillColorCMYK(*_cmyk(cover.get("text_colour")))
                c.setFont("Helvetica", font_size)
                c.drawCentredString(0, -font_size / 3, text)
                c.restoreState()
        c.showPage(); c.save()
        result = writer.add_page(PdfReader(buf).pages[0])
        for side, left in (("back", 0), ("front", (bleed + w + spine) * mm)):
            page = page_for(side)
            # Input may be trim-only or include its own 3 mm bleed. Keep
            # vector content; clip at the hinge so bleed cannot cover the spine.
            box = page.mediabox
            pw, ph = float(box.width), float(box.height)
            with_bleed = abs(pw / mm - (w + 6)) <= 1 and abs(ph / mm - (h + 6)) <= 1
            trim_only = abs(pw / mm - w) <= 1 and abs(ph / mm - h) <= 1
            if not (with_bleed or trim_only):
                raise ValueError(f"{side.title()} cover dimensions do not match the book")
            sx, sy = ((w + 6) * mm / pw, (h + 6) * mm / ph)
            full_left = -bleed * mm if side == "front" else 0
            page.cropbox = RectangleObject([float(box.left) + (bleed * mm / sx if side == "front" else 0), float(box.bottom), float(box.right) - (bleed * mm / sx if side == "back" else 0), float(box.top)])
            transform = Transformation().translate(-float(box.left), -float(box.bottom)).scale(sx, sy).translate(left + full_left, 0)
            result.merge_transformed_page(page, transform)
            if trim_only:
                warnings.append(f"{side.title()} cover bleed was fabricated by scaling artwork; check edge content")
    else:
        raise ValueError("Choose guided or designer wrap cover")

    page = writer.pages[0]
    page.mediabox = RectangleObject([0, 0, tw, th])
    page.cropbox = RectangleObject([0, 0, tw, th])
    page.trimbox = RectangleObject([bleed * mm, bleed * mm, tw - bleed * mm, th - bleed * mm])
    page.bleedbox = RectangleObject([0, 0, tw, th])
    with open(output, "wb") as stream:
        writer.write(stream)
    return {"spine_mm": spine, "width_mm": tw / mm, "height_mm": th / mm, "warnings": warnings}


def assemble_perfect_bound_cover(bundle, workspace, storage):
    cover = (bundle.configuration or {}).get("perfect_bound_cover")
    if not cover:
        return None
    # Never download an arbitrary URL/key from the cover block. Its sources
    # must also exist in the job's independent, tenant-scoped asset snapshot.
    allowed = {path for _, path in bundle.asset_paths}
    sources = {}
    for side in (["wrap"] if cover.get("mode") == "wrap" else ["back", "front"]):
        source = cover.get(side) or {}
        path = source.get("storage_path")
        if not path or path not in allowed:
            raise ValueError("Cover PDF is not a frozen source asset for this job")
        local = workspace.path(f"perfect-bound-{side}.pdf")
        storage.download(path, local)
        sources[side] = local
    output = workspace.path("perfect-bound-cover-wrap.pdf")
    report = compose_perfect_bound_wrap(cover, sources, output)
    return output, report