"""Templated-artwork → print-ready PDF assembly.

An admin uploads a finished multi-page base PDF (e.g. a 12-page deskpad
calendar) and draws placeholder boxes on it. The customer drops an image
into each image placeholder and types into each text placeholder; the same
content repeats on every page.

`order_jobs.configuration.templated_artwork` carries the spec
(see src/lib/artworkTemplates/types.ts):

    {
      "template_id": "...",
      "base_pdf_path": "artwork-templates/<id>/base.pdf",
      "trim_width_mm": 210, "trim_height_mm": 297,
      "placeholder_defs": [ {id, kind, x_mm, y_mm, width_mm, height_mm,
                             corner_radius_mm, background_hex, text_style,
                             default_value} ],
      "placeholders": [ {placeholder_id, kind:"image", storage_path, fit,
                         scale, offset_x, offset_y, background_hex}
                      | {placeholder_id, kind:"text", value} ]
    }

Output: the base PDF with every placeholder stamped, at the customer's
original upload resolution, as a single print-ready PDF.

Geometry mirrors the browser proof exactly (see
src/lib/artworkTemplates/renderTemplate.ts):
- Placeholder x/y/w/h are millimetres from the TOP-LEFT of the trim box.
- ``fit`` = contain, anything else = cover; ``scale`` multiplies the fit
  scale; ``offset_x/offset_y`` are -1..1 across the spare space.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as rl_canvas

from app.services.files import Workspace, unique_name
from app.services.storage import StorageService

log = logging.getLogger(__name__)

DEFAULT_TEXT_STYLE: dict[str, Any] = {
    "fontFamily": "Helvetica",
    "fontSizePt": 12,
    "fontWeight": "normal",
    "fontStyle": "normal",
    "colorHex": "#111111",
    "align": "left",
    "verticalAlign": "top",
    "lineHeight": 1.2,
    "uppercase": False,
}


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def is_templated_artwork_job(bundle) -> bool:
    """True when the bundle carries a templated-artwork spec."""
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    ta = cfg.get("templated_artwork")
    return isinstance(ta, dict) and bool(ta.get("base_pdf_path"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_cmyk(img: Image.Image) -> Image.Image:
    """Flatten alpha onto white and convert to CMYK for press output."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    if img.mode != "CMYK":
        img = img.convert("CMYK")
    return img


def _font_name(style: dict[str, Any]) -> str:
    """Map the browser font style onto a PDF base-14 face.

    Preview and print must agree, so we deliberately stay inside the fonts
    every PDF reader (and our preview CSS stack) can render.
    """
    family = str(style.get("fontFamily") or "Helvetica").lower()
    bold = str(style.get("fontWeight") or "").lower() == "bold"
    italic = str(style.get("fontStyle") or "").lower() == "italic"

    if "times" in family or ("serif" in family and "sans" not in family):
        base, b, i, bi = "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"
    elif "courier" in family or "mono" in family:
        base, b, i, bi = "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"
    else:
        base, b, i, bi = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"

    if bold and italic:
        return bi
    if bold:
        return b
    if italic:
        return i
    return base


def _wrap_lines(text: str, font: str, size_pt: float, max_width_pt: float) -> list[str]:
    out: list[str] = []
    for paragraph in text.split("\n"):
        words = [w for w in paragraph.split() if w]
        if not words:
            out.append("")
            continue
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if pdfmetrics.stringWidth(candidate, font, size_pt) <= max_width_pt:
                line = candidate
            else:
                out.append(line)
                line = word
        out.append(line)
    return out


def _image_draw_rect(
    box_w: float, box_h: float, img_w: float, img_h: float, value: dict[str, Any]
) -> tuple[float, float, float, float]:
    """Return (dx, dy, w, h) of the image within the box, in box-local
    coordinates with the origin at the box's TOP-LEFT (y grows downwards) —
    identical maths to the browser proof."""
    if img_w <= 0 or img_h <= 0:
        return (0.0, 0.0, box_w, box_h)
    box_ratio = box_w / box_h
    img_ratio = img_w / img_h
    cover = str(value.get("fit") or "fill") != "fit"
    if cover == (img_ratio > box_ratio):
        fit_scale = box_h / img_h
    else:
        fit_scale = box_w / img_w
    s = fit_scale * max(0.1, _num(value.get("scale"), 1.0) or 1.0)
    w = img_w * s
    h = img_h * s
    spare_x = box_w - w
    spare_y = box_h - h
    ox = _num(value.get("offset_x")) * (abs(spare_x) / 2.0)
    oy = _num(value.get("offset_y")) * (abs(spare_y) / 2.0)
    return (spare_x / 2.0 + ox, spare_y / 2.0 + oy, w, h)


# ---------------------------------------------------------------------------
# Overlay rendering
# ---------------------------------------------------------------------------
def _render_overlay(
    out_pdf: Path,
    page_w_pt: float,
    page_h_pt: float,
    trim_x_pt: float,
    trim_top_pt: float,
    defs: list[dict[str, Any]],
    values: dict[str, dict[str, Any]],
    images: dict[str, Image.Image],
) -> None:
    """Draw every placeholder onto a transparent single-page PDF that is
    later merged over the base template page.

    Placeholder geometry is millimetres measured from the TRIM box's top-left
    corner (exactly what the designer measures in Illustrator), so the overlay
    is drawn 1:1 in millimetres and simply offset to the trim origin. A base
    PDF carrying bleed and crop marks therefore lines up perfectly.
    """
    sx = 1.0
    sy = 1.0

    c = rl_canvas.Canvas(str(out_pdf), pagesize=(page_w_pt, page_h_pt))

    for d in defs:
        pid = str(d.get("id") or "")
        value = values.get(pid) or {}
        x_pt = trim_x_pt + _num(d.get("x_mm")) * mm
        w_pt = _num(d.get("width_mm")) * mm
        h_pt = _num(d.get("height_mm")) * mm
        # Convert top-left mm origin (from the trim top edge) to PDF points.
        y_pt = trim_top_pt - (_num(d.get("y_mm")) * mm) - h_pt

        radius = _num(d.get("corner_radius_mm")) * mm * min(sx, sy)
        radius = max(0.0, min(radius, min(w_pt, h_pt) / 2.0))
        if w_pt <= 0 or h_pt <= 0:
            continue

        if (d.get("kind") or "image") == "image":
            bg = value.get("background_hex") or d.get("background_hex")
            img = images.get(pid)
            if not bg and img is None:
                continue
            c.saveState()
            path = c.beginPath()
            if radius:
                path.roundRect(x_pt, y_pt, w_pt, h_pt, radius)
            else:
                path.rect(x_pt, y_pt, w_pt, h_pt)
            c.clipPath(path, stroke=0, fill=0)
            if bg:
                try:
                    c.setFillColor(HexColor(bg))
                    c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
                except ValueError:
                    log.warning("templated_artwork: bad background colour %r", bg)
            if img is not None:
                dx, dy, dw, dh = _image_draw_rect(w_pt, h_pt, img.width, img.height, value)
                buf = io.BytesIO()
                _to_cmyk(img).save(buf, format="JPEG", quality=92, optimize=True)
                buf.seek(0)
                c.drawImage(
                    ImageReader(buf),
                    x_pt + dx,
                    # dy is measured downwards from the box top.
                    y_pt + h_pt - dy - dh,
                    width=dw,
                    height=dh,
                    preserveAspectRatio=False,
                    anchor="c",
                    mask=None,
                )
            c.restoreState()
            continue

        # ── Text placeholder ────────────────────────────────────────────
        style = {**DEFAULT_TEXT_STYLE, **(d.get("text_style") or {})}
        raw = value.get("value") or d.get("default_value") or ""
        text = str(raw)
        if style.get("uppercase"):
            text = text.upper()
        if not text.strip():
            continue

        font = _font_name(style)
        size_pt = _num(style.get("fontSizePt"), 12) * min(sx, sy)
        line_h = size_pt * (_num(style.get("lineHeight"), 1.2) or 1.2)
        lines = _wrap_lines(text, font, size_pt, w_pt)
        block_h = len(lines) * line_h
        v_align = str(style.get("verticalAlign") or "top")
        if v_align == "top":
            top_offset = 0.0
        elif v_align == "bottom":
            top_offset = h_pt - block_h
        else:
            top_offset = (h_pt - block_h) / 2.0

        align = str(style.get("align") or "left")
        c.saveState()
        path = c.beginPath()
        path.rect(x_pt, y_pt, w_pt, h_pt)
        c.clipPath(path, stroke=0, fill=0)
        try:
            c.setFillColor(HexColor(str(style.get("colorHex") or "#111111")))
        except ValueError:
            c.setFillColorRGB(0.07, 0.07, 0.07)
        c.setFont(font, size_pt)
        for idx, line in enumerate(lines):
            # Baseline sits one ascent below the line's top edge; 0.8em is a
            # close match to the canvas "top" baseline used in the proof.
            baseline = y_pt + h_pt - top_offset - (idx * line_h) - size_pt * 0.8
            if align == "center":
                c.drawCentredString(x_pt + w_pt / 2.0, baseline, line)
            elif align == "right":
                c.drawRightString(x_pt + w_pt, baseline, line)
            else:
                c.drawString(x_pt, baseline, line)
        c.restoreState()

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def assemble_templated_artwork(
    bundle,
    workspace: Workspace,
    job_number: str,
) -> tuple[str, dict[str, Any]]:
    """Stamp the customer's content into the base template PDF.

    Returns ``(storage_path, report)``.
    """
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    ta = cfg.get("templated_artwork")
    if not isinstance(ta, dict):
        raise ValueError("templated-artwork job is missing configuration.templated_artwork")

    base_path = ta.get("base_pdf_path")
    if not base_path:
        raise ValueError("templated-artwork job has no base_pdf_path")

    defs = [d for d in (ta.get("placeholder_defs") or []) if isinstance(d, dict)]
    values: dict[str, dict[str, Any]] = {
        str(v.get("placeholder_id")): v
        for v in (ta.get("placeholders") or [])
        if isinstance(v, dict) and v.get("placeholder_id")
    }
    if not defs:
        raise ValueError(
            "templated-artwork job carries no placeholder_defs — the order was "
            "placed before the geometry snapshot shipped and cannot be composed."
        )

    storage = StorageService()

    local_base = workspace.path("template-base.pdf")
    storage.download(base_path, local_base)
    reader = PdfReader(str(local_base))
    if len(reader.pages) == 0:
        raise ValueError("templated-artwork base PDF has no pages")

    # Download every customer image once — the same content repeats on all pages.
    images: dict[str, Image.Image] = {}
    for idx, d in enumerate(defs):
        pid = str(d.get("id") or "")
        v = values.get(pid)
        if (d.get("kind") or "image") != "image" or not v:
            continue
        src = v.get("storage_path")
        if not src:
            continue
        local_img = workspace.path(f"ph-{idx:03d}-{Path(str(src)).name}")
        storage.download(str(src), local_img)
        img = ImageOps.exif_transpose(Image.open(local_img))
        if img.mode not in ("RGB", "RGBA", "L", "CMYK"):
            img = img.convert("RGB")
        images[pid] = img

    trim_w_mm = _num(ta.get("trim_width_mm"))
    trim_h_mm = _num(ta.get("trim_height_mm"))
    spec_off_x_mm = _num(ta.get("trim_offset_x_mm"))
    spec_off_y_mm = _num(ta.get("trim_offset_y_mm"))

    writer = PdfWriter()
    for page_index, page in enumerate(reader.pages):
        box = page.mediabox
        page_w_pt = float(box.width)
        page_h_pt = float(box.height)

        # Where does the trimmed sheet sit on this page? Prefer the PDF's own
        # TrimBox; fall back to the offsets captured when the template was set
        # up; finally assume the page is already trimmed.
        trim_x_pt: float | None = None
        trim_top_pt: float | None = None
        try:
            tb = page.trimbox
            tw = float(tb.width)
            th = float(tb.height)
            if tw > 1 and th > 1 and (tw <= page_w_pt + 1 and th <= page_h_pt + 1):
                trim_x_pt = float(tb.left) - float(box.left)
                trim_top_pt = float(tb.top) - float(box.bottom)
        except Exception:  # noqa: BLE001 - malformed boxes are not fatal
            trim_x_pt = None
        if trim_x_pt is None or trim_top_pt is None:
            trim_x_pt = spec_off_x_mm * mm
            trim_top_pt = page_h_pt - spec_off_y_mm * mm

        overlay_path = workspace.path(f"overlay-{page_index:03d}.pdf")
        _render_overlay(
            overlay_path,
            page_w_pt,
            page_h_pt,
            trim_x_pt,
            trim_top_pt,
            defs,
            values,
            images,
        )
        overlay_page = PdfReader(str(overlay_path)).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)


    out_pdf = workspace.path("templated-artwork.pdf")
    with open(out_pdf, "wb") as fh:
        writer.write(fh)

    storage_path = unique_name(
        f"production/print-ready/{job_number}/templated-artwork", ".pdf",
    )
    storage.upload(out_pdf, storage_path, "application/pdf")

    report = {
        "engine": "templated_artwork",
        "template_id": ta.get("template_id"),
        "base_pdf_path": base_path,
        "page_count": len(reader.pages),
        "trim_width_mm": trim_w_mm or None,
        "trim_height_mm": trim_h_mm or None,
        "placeholder_count": len(defs),
        "image_placeholders_filled": len(images),
        "storage_path": storage_path,
    }
    log.info("templated_artwork: assembled %s", report)
    return storage_path, report
