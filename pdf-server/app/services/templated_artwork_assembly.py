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
import shutil
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib.colors import CMYKColor, HexColor
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
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


def _cmyk(hex_value: str | None, default_k: float = 1.0):
    """Convert a hex colour to a DeviceCMYK colour.

    Text and flat fills must never leave as DeviceRGB — a press reading an
    RGB "black" builds it out of all four inks. Pure/near black is forced to
    100% K; every other colour is converted with the naive (and for flat
    brand colours entirely adequate) RGB→CMYK formula, no ICC pass, so the
    customer's own supplied artwork is untouched.
    """
    raw = str(hex_value or "").strip()
    try:
        rgb = HexColor(raw)
        r, g, b = rgb.red, rgb.green, rgb.blue
    except Exception:  # noqa: BLE001 - bad colour is not fatal
        return CMYKColor(0, 0, 0, default_k)
    # Near-black (anything up to #1a1a1a) prints as 100% K, nothing else.
    if max(r, g, b) <= 0.105:
        return CMYKColor(0, 0, 0, 1)
    k = 1.0 - max(r, g, b)
    if k >= 0.999:
        return CMYKColor(0, 0, 0, 1)
    denom = 1.0 - k
    return CMYKColor(
        (1.0 - r - k) / denom,
        (1.0 - g - k) / denom,
        (1.0 - b - k) / denom,
        k,
    )


# Embedded TrueType faces. Liberation is metrically identical to
# Arial/Helvetica (and Times/Courier for the serif/mono branches), so the
# on-screen proof, the line wrapping and the printed sheet all agree — and
# unlike the PDF base-14 faces these are actually embedded in the output.
_LIBERATION: dict[str, tuple[str, str]] = {
    # registered name        (fontconfig pattern,                fallback file stem)
    "DC-Sans": ("Liberation Sans:style=Regular", "LiberationSans-Regular"),
    "DC-Sans-Bold": ("Liberation Sans:style=Bold", "LiberationSans-Bold"),
    "DC-Sans-Italic": ("Liberation Sans:style=Italic", "LiberationSans-Italic"),
    "DC-Sans-BoldItalic": ("Liberation Sans:style=Bold Italic", "LiberationSans-BoldItalic"),
    "DC-Serif": ("Liberation Serif:style=Regular", "LiberationSerif-Regular"),
    "DC-Serif-Bold": ("Liberation Serif:style=Bold", "LiberationSerif-Bold"),
    "DC-Serif-Italic": ("Liberation Serif:style=Italic", "LiberationSerif-Italic"),
    "DC-Serif-BoldItalic": ("Liberation Serif:style=Bold Italic", "LiberationSerif-BoldItalic"),
    "DC-Mono": ("Liberation Mono:style=Regular", "LiberationMono-Regular"),
    "DC-Mono-Bold": ("Liberation Mono:style=Bold", "LiberationMono-Bold"),
    "DC-Mono-Italic": ("Liberation Mono:style=Italic", "LiberationMono-Italic"),
    "DC-Mono-BoldItalic": ("Liberation Mono:style=Bold Italic", "LiberationMono-BoldItalic"),
}

_FONT_SEARCH_DIRS = (
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/liberation2",
    "/usr/share/fonts/liberation",
)

_fonts_registered = False


def _resolve_font_file(pattern: str, stem: str) -> Path | None:
    fc = shutil.which("fc-match")
    if fc:
        try:
            out = subprocess.run(
                [fc, "-f", "%{file}", pattern],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            path = Path(out)
            # fc-match always returns *something*; only trust an exact family hit.
            if path.is_file() and stem.split("-")[0].lower() in path.name.lower():
                return path
        except (subprocess.CalledProcessError, OSError):
            pass
    for d in _FONT_SEARCH_DIRS:
        cand = Path(d) / f"{stem}.ttf"
        if cand.is_file():
            return cand
    return None


def _register_fonts() -> None:
    """Register the embedded faces once per worker process.

    Raises when the fonts are missing rather than silently emitting an
    unembedded base-14 face — un-embedded fonts cannot go to a press.
    """
    global _fonts_registered
    if _fonts_registered:
        return
    missing: list[str] = []
    for name, (pattern, stem) in _LIBERATION.items():
        path = _resolve_font_file(pattern, stem)
        if path is None:
            missing.append(stem)
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, str(path)))
        except Exception as exc:  # noqa: BLE001
            missing.append(f"{stem} ({exc})")
    if missing:
        raise RuntimeError(
            "templated_artwork: embeddable fonts are missing from the image — "
            f"cannot produce a press-safe PDF: {', '.join(missing)}"
        )
    for family, base in (
        ("DC-Sans", "DC-Sans"),
        ("DC-Serif", "DC-Serif"),
        ("DC-Mono", "DC-Mono"),
    ):
        pdfmetrics.registerFontFamily(
            family,
            normal=base,
            bold=f"{base}-Bold",
            italic=f"{base}-Italic",
            boldItalic=f"{base}-BoldItalic",
        )
    _fonts_registered = True
    log.info("templated_artwork: registered embedded fonts %s", sorted(_LIBERATION))


def _font_name(style: dict[str, Any]) -> str:
    """Map the browser font style onto an embedded TrueType face."""
    family = str(style.get("fontFamily") or "Helvetica").lower()
    bold = str(style.get("fontWeight") or "").lower() == "bold"
    italic = str(style.get("fontStyle") or "").lower() == "italic"

    if "times" in family or ("serif" in family and "sans" not in family):
        base = "DC-Serif"
    elif "courier" in family or "mono" in family:
        base = "DC-Mono"
    else:
        base = "DC-Sans"

    if bold and italic:
        return f"{base}-BoldItalic"
    if bold:
        return f"{base}-Bold"
    if italic:
        return f"{base}-Italic"
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
    skip_ids: set[str] | None = None,
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

    _register_fonts()
    # initialFontName keeps reportlab from seeding an unembedded base-14
    # Helvetica resource on the page.
    c = rl_canvas.Canvas(
        str(out_pdf),
        pagesize=(page_w_pt, page_h_pt),
        initialFontName="DC-Sans",
        initialFontSize=12,
    )


    for d in defs:
        pid = str(d.get("id") or "")
        value = values.get(pid) or {}
        # Constant opacity (e.g. a 10% watermark). The customer's choice wins,
        # otherwise the template default.
        alpha = _num(
            value.get("opacity") if value.get("opacity") is not None else d.get("opacity"), 1.0
        )
        alpha = max(0.0, min(1.0, alpha if alpha else 1.0))
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
            # Vector uploads are stamped later, straight from their PDF.
            img = None if (skip_ids and pid in skip_ids) else images.get(pid)
            if not bg and img is None:
                continue
            c.saveState()
            c.setFillAlpha(alpha)
            c.setStrokeAlpha(alpha)
            path = c.beginPath()
            if radius:
                path.roundRect(x_pt, y_pt, w_pt, h_pt, radius)
            else:
                path.rect(x_pt, y_pt, w_pt, h_pt)
            c.clipPath(path, stroke=0, fill=0)
            if bg:
                # DeviceCMYK, never DeviceRGB — see _cmyk().
                c.setFillColor(_cmyk(bg))
                c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)

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
        c.setFillAlpha(alpha)
        c.setStrokeAlpha(alpha)
        path = c.beginPath()
        path.rect(x_pt, y_pt, w_pt, h_pt)
        c.clipPath(path, stroke=0, fill=0)
        try:
            c.setFillColor(_cmyk(str(style.get("colorHex") or "#111111")))
        except ValueError:
            c.setFillColor(CMYKColor(0, 0, 0, 1))

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


def _audit_fonts(pdf_path: Path) -> dict[str, Any]:
    """List the fonts in the finished PDF and whether each one is embedded.

    Un-embedded fonts cannot go to a press, so this lands in the assembly
    report where production can see it at a glance.
    """
    tool = shutil.which("pdffonts")
    if not tool:
        return {"checked": False}
    try:
        out = subprocess.run(
            [tool, str(pdf_path)], check=True, capture_output=True, text=True
        ).stdout
    except (subprocess.CalledProcessError, OSError) as exc:  # noqa: BLE001
        log.warning("templated_artwork: pdffonts failed: %s", exc)
        return {"checked": False}

    rows: list[dict[str, Any]] = []
    for line in out.splitlines()[2:]:
        parts = line.split()
        if len(parts) < 5:
            continue
        rows.append({"name": parts[0], "embedded": parts[3].lower() == "yes"})
    unembedded = [r["name"] for r in rows if not r["embedded"]]
    if unembedded:
        log.warning("templated_artwork: UNEMBEDDED fonts in output: %s", unembedded)
    return {"checked": True, "fonts": rows, "unembedded": unembedded}


# ---------------------------------------------------------------------------
# Layering helpers
# ---------------------------------------------------------------------------
def _layer_of(d: dict[str, Any]) -> str:
    return "under" if str(d.get("layer") or "over") == "under" else "over"


def _split_layers(defs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return ``(under, over)`` ordered by z_index — matching the browser proof."""
    ordered = sorted(
        defs,
        key=lambda d: (_num(d.get("z_index")), _num(d.get("sort_order"))),
    )
    return (
        [d for d in ordered if _layer_of(d) == "under"],
        [d for d in ordered if _layer_of(d) == "over"],
    )


def _knockout_base_page(
    base_pdf: Path,
    page_index: int,
    out_png: Path,
    tolerance: float,
    dpi: int = 300,
) -> bool:
    """Rasterise one base page with a transparent background so placeholders
    on the ``under`` layer show through.

    A vector base can't have its white knocked out without rewriting its
    content streams, so the template layer becomes a high-resolution RGBA
    raster instead. Returns False when mutool isn't available.
    """
    mutool = shutil.which("mutool")
    if not mutool:
        log.warning("templated_artwork: mutool missing — cannot knock out the base background")
        return False
    tmp = out_png.with_suffix(".raw.png")
    try:
        subprocess.run(
            [
                mutool, "draw", "-F", "png", "-c", "rgba", "-r", str(dpi),
                "-o", str(tmp), str(base_pdf), str(page_index + 1),
            ],
            check=True,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, OSError) as exc:  # noqa: BLE001
        log.warning("templated_artwork: mutool render failed: %s", exc)
        return False

    img = Image.open(tmp).convert("RGBA")
    tol = max(0.0, min(60.0, tolerance))
    cut = 255 - tol
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = min(r, g, b)
            if lum >= cut:
                px[x, y] = (r, g, b, 0)
            elif lum >= cut - 24:
                px[x, y] = (r, g, b, int(a * (1 - (lum - (cut - 24)) / 24)))
    img.save(out_png)
    return True


def _render_base_raster_layer(
    out_pdf: Path, png: Path, page_w_pt: float, page_h_pt: float
) -> None:
    """Wrap a transparent base-page PNG in a single-page PDF at page size."""
    c = rl_canvas.Canvas(str(out_pdf), pagesize=(page_w_pt, page_h_pt))
    c.drawImage(
        ImageReader(str(png)), 0, 0, width=page_w_pt, height=page_h_pt, mask="auto"
    )
    c.showPage()
    c.save()


def _stamp_vector_placements(
    pdf_path: Path,
    placements: list[dict[str, Any]],
) -> int:
    """Place customer-supplied PDFs as form XObjects — vector, full quality.

    Each placement carries the clip box, the target rectangle, the constant
    alpha (so a 10% watermark stays vector) and whether it belongs under or
    over the template artwork.
    """
    if not placements:
        return 0
    try:
        import pikepdf
    except ImportError:  # pragma: no cover - pikepdf ships in requirements
        log.warning("templated_artwork: pikepdf missing — vector placements skipped")
        return 0

    stamped = 0
    with pikepdf.open(str(pdf_path), allow_overwriting_input=True) as pdf:
        sources: dict[str, Any] = {}
        for page in pdf.pages:
            for pl in placements:
                src_path = str(pl["source"])
                try:
                    src = sources.get(src_path)
                    if src is None:
                        src = pikepdf.open(src_path)
                        sources[src_path] = src
                    form = pdf.copy_foreign(
                        pikepdf.Page(src.pages[0]).as_form_xobject()
                    )
                    bbox = [float(v) for v in form.BBox]
                    bw = abs(bbox[2] - bbox[0]) or 1.0
                    bh = abs(bbox[3] - bbox[1]) or 1.0
                    sx = pl["w"] / bw
                    sy = pl["h"] / bh
                    tx = pl["x"] - bbox[0] * sx
                    ty = pl["y"] - bbox[1] * sy

                    pg = pikepdf.Page(page)
                    xname = pg.add_resource(form, pikepdf.Name.XObject)
                    gs = pdf.make_indirect(
                        pikepdf.Dictionary(
                            Type=pikepdf.Name.ExtGState,
                            ca=pl["alpha"],
                            CA=pl["alpha"],
                        )
                    )
                    gname = pg.add_resource(gs, pikepdf.Name.ExtGState)
                    content = (
                        f"q {gname} gs "
                        f"{pl['clip_x']:.4f} {pl['clip_y']:.4f} "
                        f"{pl['clip_w']:.4f} {pl['clip_h']:.4f} re W n "
                        f"{sx:.6f} 0 0 {sy:.6f} {tx:.4f} {ty:.4f} cm "
                        f"{xname} Do Q"
                    ).encode()
                    pg.contents_add(
                        pikepdf.Stream(pdf, content), prepend=pl["layer"] == "under"
                    )
                    stamped += 1
                except Exception as exc:  # noqa: BLE001 - never fail the job
                    log.warning("templated_artwork: vector placement failed: %s", exc)
        pdf.save(str(pdf_path))
        for src in sources.values():
            src.close()
    return stamped


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

    # Download every customer asset once — the same content repeats on all pages.
    images: dict[str, Image.Image] = {}
    vector_sources: dict[str, Path] = {}
    for idx, d in enumerate(defs):
        pid = str(d.get("id") or "")
        v = values.get(pid)
        if (d.get("kind") or "image") != "image" or not v:
            continue
        # Prefer the original vector PDF — placed 1:1, never rasterised.
        pdf_src = v.get("source_pdf_path")
        if pdf_src:
            local_pdf = workspace.path(f"ph-{idx:03d}-source.pdf")
            try:
                storage.download(str(pdf_src), local_pdf)
                vector_sources[pid] = local_pdf
                continue
            except Exception as exc:  # noqa: BLE001 - fall back to the raster
                log.warning("templated_artwork: vector source %s failed: %s", pdf_src, exc)
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
    knockout = bool(ta.get("base_knockout_white"))
    knockout_tol = _num(ta.get("base_knockout_tolerance"), 12.0)

    under_defs, over_defs = _split_layers(defs)
    vector_ids = set(vector_sources)
    placements: list[dict[str, Any]] = []
    knocked_out = False
    base_geometry: dict[str, Any] = {}


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
            # The template editor measures offsets in the *crop* box space
            # (that's what pdf.js renders), so anchor the fallback there —
            # otherwise a page whose CropBox is inset from the MediaBox would
            # shift every placement by the bleed.
            try:
                cb = page.cropbox
                ref_left = float(cb.left)
                ref_top = float(cb.top)
            except Exception:  # noqa: BLE001 - optional box
                ref_left = float(box.left)
                ref_top = float(box.top)
            trim_x_pt = (ref_left - float(box.left)) + spec_off_x_mm * mm
            trim_top_pt = (ref_top - float(box.bottom)) - spec_off_y_mm * mm


        # Record page 1's geometry so the admin panel can see, without opening
        # the PDF, whether the supplied base actually carries bleed.
        if page_index == 0:
            def _box_mm(getter) -> list[float] | None:
                try:
                    bx = getter()
                    return [
                        round(float(bx.width) / mm, 2),
                        round(float(bx.height) / mm, 2),
                    ]
                except Exception:  # noqa: BLE001
                    return None

            base_geometry = {
                "media_mm": _box_mm(lambda: page.mediabox),
                "crop_mm": _box_mm(lambda: page.cropbox),
                "trim_mm": _box_mm(lambda: page.trimbox),
                "bleed_mm": _box_mm(lambda: page.bleedbox),
                "spec_trim_mm": [trim_w_mm or None, trim_h_mm or None],
            }
            media = base_geometry["media_mm"] or [0, 0]
            spec_trim_w = trim_w_mm or 0
            spec_trim_h = trim_h_mm or 0
            has_bleed = bool(
                spec_trim_w
                and spec_trim_h
                and (media[0] > spec_trim_w + 0.5 or media[1] > spec_trim_h + 0.5)
            )
            base_geometry["has_bleed"] = has_bleed
            if not has_bleed:
                log.warning(
                    "templated_artwork: base PDF %s carries no bleed — page is %s mm "
                    "and the trim is %s mm; the output cannot invent bleed or crop marks",
                    base_path, media, [spec_trim_w, spec_trim_h],
                )


        # Collect vector placements once — geometry is identical on every page.
        if page_index == 0:
            for d in defs:
                pid = str(d.get("id") or "")
                if pid not in vector_ids:
                    continue
                value = values.get(pid) or {}
                w_pt = _num(d.get("width_mm")) * mm
                h_pt = _num(d.get("height_mm")) * mm
                if w_pt <= 0 or h_pt <= 0:
                    continue
                x_pt = trim_x_pt + _num(d.get("x_mm")) * mm
                y_pt = trim_top_pt - (_num(d.get("y_mm")) * mm) - h_pt
                try:
                    src_reader = PdfReader(str(vector_sources[pid]))
                    src_box = src_reader.pages[0].mediabox
                    src_w = float(src_box.width)
                    src_h = float(src_box.height)
                except Exception as exc:  # noqa: BLE001
                    log.warning("templated_artwork: unreadable vector source: %s", exc)
                    continue
                dx, dy, dw, dh = _image_draw_rect(w_pt, h_pt, src_w, src_h, value)
                alpha = _num(
                    value.get("opacity")
                    if value.get("opacity") is not None
                    else d.get("opacity"),
                    1.0,
                )
                placements.append(
                    {
                        "source": vector_sources[pid],
                        "clip_x": x_pt,
                        "clip_y": y_pt,
                        "clip_w": w_pt,
                        "clip_h": h_pt,
                        "x": x_pt + dx,
                        "y": y_pt + h_pt - dy - dh,
                        "w": dw,
                        "h": dh,
                        "alpha": max(0.0, min(1.0, alpha if alpha else 1.0)),
                        "layer": _layer_of(d),
                    }
                )

        composed = page

        # 1. Boxes that sit BEHIND the template artwork.
        if under_defs:
            under_path = workspace.path(f"underlay-{page_index:03d}.pdf")
            _render_overlay(
                under_path, page_w_pt, page_h_pt, trim_x_pt, trim_top_pt,
                under_defs, values, images, vector_ids,
            )
            under_page = PdfReader(str(under_path)).pages[0]

            base_layer = page
            if knockout:
                png = workspace.path(f"base-knockout-{page_index:03d}.png")
                if _knockout_base_page(local_base, page_index, png, knockout_tol):
                    layer_pdf = workspace.path(f"base-layer-{page_index:03d}.pdf")
                    _render_base_raster_layer(layer_pdf, png, page_w_pt, page_h_pt)
                    base_layer = PdfReader(str(layer_pdf)).pages[0]
                    knocked_out = True
            # The underlay becomes the page; the template is merged on top.
            under_page.merge_page(base_layer)
            # Keep the original page geometry (trim/bleed boxes drive imposition).
            under_page.mediabox = page.mediabox
            for attr in ("cropbox", "trimbox", "bleedbox", "artbox"):
                try:
                    setattr(under_page, attr, getattr(page, attr))
                except Exception:  # noqa: BLE001 - optional boxes
                    pass
            composed = under_page

        # 2. Boxes in front of the template artwork.
        if over_defs:
            overlay_path = workspace.path(f"overlay-{page_index:03d}.pdf")
            _render_overlay(
                overlay_path, page_w_pt, page_h_pt, trim_x_pt, trim_top_pt,
                over_defs, values, images, vector_ids,
            )
            composed.merge_page(PdfReader(str(overlay_path)).pages[0])

        # Belt and braces: whatever branch produced `composed`, the output page
        # must be the supplied page — full media box, with every box copied
        # through. Bleed and crop marks in the base survive untouched.
        composed.mediabox = page.mediabox
        for attr in ("cropbox", "trimbox", "bleedbox", "artbox"):
            try:
                setattr(composed, attr, getattr(page, attr))
            except Exception:  # noqa: BLE001 - optional boxes
                pass
        # If the base carries bleed but no TrimBox, stamp one from the spec so
        # imposition and the guillotine know where the sheet is cut.
        if base_geometry.get("has_bleed") and trim_w_mm and trim_h_mm:
            try:
                needs_trim = float(composed.trimbox.width) >= page_w_pt - 0.5
            except Exception:  # noqa: BLE001
                needs_trim = True
            if needs_trim:
                left = float(page.mediabox.left) + trim_x_pt
                top = float(page.mediabox.bottom) + trim_top_pt
                composed.trimbox = RectangleObject(
                    (left, top - trim_h_mm * mm, left + trim_w_mm * mm, top)
                )

        writer.add_page(composed)


    out_pdf = workspace.path("templated-artwork.pdf")
    with open(out_pdf, "wb") as fh:
        writer.write(fh)

    # Customer PDFs go in last, straight from their originals (vector, with a
    # real PDF transparency group when the opacity is below 100%).
    vector_stamped = _stamp_vector_placements(out_pdf, placements)

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
        "vector_placeholders": len(vector_sources),
        "vector_placements_stamped": vector_stamped,
        "under_layer_count": len(under_defs),
        "over_layer_count": len(over_defs),
        "base_knockout_applied": knocked_out,
        "base_geometry": base_geometry,
        "page_size_mm": base_geometry.get("media_mm"),
        "trim_size_mm": base_geometry.get("trim_mm") or base_geometry.get("spec_trim_mm"),
        "base_has_bleed": base_geometry.get("has_bleed"),
        "fonts": _audit_fonts(out_pdf),
        "storage_path": storage_path,
    }
    log.info("templated_artwork: assembled %s", report)
    return storage_path, report
