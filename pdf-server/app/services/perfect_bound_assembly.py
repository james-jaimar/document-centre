"""Vector perfect-bound wrap compositor. Sources come only from frozen job assets."""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import math
import re

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import DecodedStreamObject, RectangleObject
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


SPINE_FONTS = {"sans": "Helvetica", "sans_bold": "Helvetica-Bold", "serif": "Times-Roman"}
SPINE_SAFE_MM = 1.5


def placement_frame(w, h, bleed, placement):
    """Artwork frame (left, top, width, height) in mm from the trim's top-left.
    Scale 1 fills trim + bleed; x/y shift the artwork (y positive = down)."""
    p = placement if isinstance(placement, dict) else {}
    k = _number(p.get("scale", 1), 0.3, 3, "cover zoom")
    dx = _number(p.get("x", 0), -2 * (w + 2 * bleed), 2 * (w + 2 * bleed), "cover position")
    dy = _number(p.get("y", 0), -2 * (h + 2 * bleed), 2 * (h + 2 * bleed), "cover position")
    fw, fh = (w + 2 * bleed) * k, (h + 2 * bleed) * k
    return -bleed + (w + 2 * bleed - fw) / 2 + dx, -bleed + (h + 2 * bleed - fh) / 2 + dy, fw, fh


def spine_font_size_pt(spine_mm, height_mm, text, font):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    size = min(14, max(0, spine_mm - 2 * SPINE_SAFE_MM) * mm * .75)
    width = stringWidth(text, font, size) if size else 0
    if width > (height_mm - 20) * mm:
        size = size * (height_mm - 20) * mm / width
    return size


def _solid_page(tw, th, colour, rect=None):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(tw, th))
    if colour is None:
        c.setFillColorCMYK(0, 0, 0, 0)
    else:
        c.setFillColorCMYK(*_cmyk(colour))
    x, y, rw, rh = rect or (0, 0, tw, th)
    c.rect(x, y, rw, rh, fill=1, stroke=0)
    c.showPage(); c.save()
    return PdfReader(buf).pages[0]


def artwork_box(page, w, h):
    """The rectangle of a cover page that is the artwork: an explicit TrimBox
    (or its BleedBox when that carries ~3 mm bleed) wins over the MediaBox, so
    a front cover saved as one half of a larger sheet is placed correctly."""
    media = page.mediabox
    trim = page.trimbox
    if float(trim.width) >= float(media.width) - 1 and float(trim.height) >= float(media.height) - 1:
        return media
    bleed = page.bleedbox
    gap = [(float(trim.left) - float(bleed.left)) / mm, (float(bleed.right) - float(trim.right)) / mm,
           (float(trim.bottom) - float(bleed.bottom)) / mm, (float(bleed.top) - float(trim.top)) / mm]
    return bleed if all(2 <= g <= 4 for g in gap) else trim


def _clip_page(page, box):
    """Clip a page's own content to box so off-box artwork never shows."""
    data = page.get_contents().get_data() if page.get_contents() is not None else b""
    stream = DecodedStreamObject()
    stream.set_data(b"q %f %f %f %f re W n\n" % (float(box.left), float(box.bottom), float(box.width), float(box.height)) + data + b"\nQ\n")
    page.replace_contents(stream)


def _spine_page(cover, tw, th, w, h, spine, bleed):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(tw, th))
    c.setFillColorCMYK(*_cmyk(cover.get("spine_colour")))
    c.rect((bleed + w) * mm, 0, spine * mm, th, fill=1, stroke=0)
    if spine >= 4:
        title = str(cover.get("title") or "")[:120]
        author = str(cover.get("author") or "")[:100]
        text = " - ".join(part for part in (title, author) if part)
        font = SPINE_FONTS.get(cover.get("spine_font") or "sans")
        if not font:
            raise ValueError("Invalid spine font")
        if text:
            font_size = spine_font_size_pt(spine, h, text, font)
            c.saveState()
            c.translate((bleed + w + spine / 2) * mm, (bleed + h / 2) * mm)
            c.rotate(-90)
            c.setFillColorCMYK(*_cmyk(cover.get("text_colour")))
            c.setFont(font, font_size)
            c.drawCentredString(0, -font_size / 3, text)
            c.restoreState()
    c.showPage(); c.save()
    return PdfReader(buf).pages[0]


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
        blank_back = cover.get("back_blank")
        if blank_back not in (None, "white", "spine"):
            raise ValueError("Invalid blank back cover choice")
        writer.add_page(_solid_page(tw, th, None))
        result = writer.pages[0]
        if blank_back == "spine":
            result.merge_page(_solid_page(tw, th, cover.get("spine_colour"), (0, 0, (bleed + w) * mm, th)))
        sides = [("front", (bleed + w + spine) * mm, tw)] + ([] if blank_back else [("back", 0, (bleed + w) * mm)])
        for side, panel_left, panel_right in sides:
            page = page_for(side)
            box = artwork_box(page, w, h)
            _clip_page(page, box)
            pw, ph = float(box.width), float(box.height)
            with_bleed = abs(pw / mm - (w + 6)) <= 1 and abs(ph / mm - (h + 6)) <= 1
            trim_only = abs(pw / mm - w) <= 1 and abs(ph / mm - h) <= 1
            if not (with_bleed or trim_only):
                raise ValueError(f"{side.title()} cover dimensions do not match the book")
            left, top, fw, fh = placement_frame(w, h, bleed, (cover.get(side) or {}).get("placement"))
            trim_left = bleed + w + spine if side == "front" else bleed
            frame_left = (trim_left + left) * mm
            frame_bottom = (bleed + h - top - fh) * mm
            transform = Transformation().translate(-float(box.left), -float(box.bottom)).scale(fw * mm / pw, fh * mm / ph).translate(frame_left, frame_bottom)
            # Stage on a panel-sized page so pypdf clips moved/zoomed artwork
            # to its own panel; it can never spill across the spine.
            panel = PdfWriter().add_blank_page(tw, th)
            panel.merge_transformed_page(page, transform)
            clip = RectangleObject([panel_left, 0, panel_right, th])
            panel.mediabox = RectangleObject([0, 0, tw, th])
            panel.cropbox = clip
            panel.trimbox = clip
            result.merge_page(panel)
            if trim_only:
                warnings.append(f"{side.title()} cover bleed was fabricated by scaling artwork; check edge content")
        result.merge_page(_spine_page(cover, tw, th, w, h, spine, bleed))
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
    for side in (["wrap"] if cover.get("mode") == "wrap" else (["front"] if cover.get("back_blank") else ["back", "front"])):
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