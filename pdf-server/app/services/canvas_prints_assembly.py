"""Canvas-prints → print-ready PDF assembly.

Canvas-prints jobs upload raw images (or a rasterised PDF page 1) and
configure per-canvas: finished size, orientation, wrap depth, edge
finish (no_edge_print / gallery_wrap / colour_wrap), optional wrap
colour, and a crop.

The `order_jobs.configuration.canvas_prints.canvases[]` array carries
the spec (see src/lib/canvasPrints/canvasSpecTypes.ts).

Output contract (as agreed with the user):
- **One canvas upload = one PDF file.** No multi-page merging.
- All prints are CMYK (large-format canvas presses are CMYK devices).
- 300 DPI target, no low-res warnings in the print-ready pipeline
  (the customer-facing modal handles that).
- Gallery-wrap extends the source image around the front face by
  `wrap_depth + bleed` on every side (5 mm bleed default).
- Colour-wrap fills the page in the chosen CMYK colour and centres
  the front image on top.
- No edge print = plain front face at page size (no bleed sides).
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

from app.services.files import Workspace, unique_name
from app.services.storage import StorageService

log = logging.getLogger(__name__)

DEFAULT_BLEED_MM = 5.0
DEFAULT_DPI = 300


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def is_canvas_prints_job(bundle) -> bool:
    """Return True when the bundle represents a canvas-prints job."""
    job = bundle.job or {}
    cat = (job.get("product_category") or "").lower()
    if cat in ("canvas_wrap", "canvas-prints", "canvas_prints", "canvas"):
        return True
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    return isinstance(cfg.get("canvas_prints"), dict)


# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
def _hex_to_cmyk_tuple(hex_str: str | None) -> tuple[float, float, float, float]:
    """Convert an sRGB hex string to a 0..1 CMYK tuple via PIL's naive
    RGB->CMYK conversion. Good enough for solid wrap fills; a future
    revision can swap in an ICC-profile round-trip (fogra39) once the
    profile is bundled with the pdf-server image."""
    if not hex_str:
        return (0.0, 0.0, 0.0, 0.0)
    h = hex_str.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return (0.0, 0.0, 0.0, 0.0)
    try:
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
    except ValueError:
        return (0.0, 0.0, 0.0, 0.0)
    swatch = Image.new("RGB", (1, 1), (r, g, b)).convert("CMYK")
    c, m, y, k = swatch.getpixel((0, 0))
    return (c / 255.0, m / 255.0, y / 255.0, k / 255.0)


def _to_cmyk(img: Image.Image) -> Image.Image:
    """Flatten alpha (onto white) and convert to CMYK for press output."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    if img.mode != "CMYK":
        img = img.convert("CMYK")
    return img


# ---------------------------------------------------------------------------
# Image prep
# ---------------------------------------------------------------------------
def _load_and_orient(local_image: Path, rotation: float | int | None) -> Image.Image:
    img = Image.open(local_image)
    img = ImageOps.exif_transpose(img)
    if rotation:
        try:
            r = int(rotation) % 360
        except (TypeError, ValueError):
            r = 0
        if r:
            # PIL.rotate is CCW; react-easy-crop rotation is CW.
            img = img.rotate(-r, expand=True, resample=Image.BICUBIC)
    if img.mode not in ("RGB", "RGBA", "L"):
        img = img.convert("RGB")
    return img


def _crop_front(img: Image.Image, crop: dict | None) -> Image.Image:
    """Return just the front-face crop, clipped to image bounds."""
    if not isinstance(crop, dict):
        return img
    try:
        x = max(0, int(round(float(crop["x"]))))
        y = max(0, int(round(float(crop["y"]))))
        w = int(round(float(crop["width"])))
        h = int(round(float(crop["height"])))
    except (KeyError, TypeError, ValueError):
        return img
    if w <= 0 or h <= 0:
        return img
    x2 = min(img.width, x + w)
    y2 = min(img.height, y + h)
    if x >= x2 or y >= y2:
        return img
    return img.crop((x, y, x2, y2))


def _extract_extended(
    img: Image.Image,
    crop: dict,
    front_w_mm: float,
    front_h_mm: float,
    extend_mm: float,
) -> Image.Image:
    """Sample a region equal to the front-face crop expanded by ``extend_mm``
    on every side (mapped back into source pixels). Missing pixels are
    padded with white so the wrap sides always have something to show."""
    try:
        x = float(crop["x"]); y = float(crop["y"])
        w = float(crop["width"]); h = float(crop["height"])
    except (KeyError, TypeError, ValueError):
        return _crop_front(img, crop)
    if w <= 0 or h <= 0:
        return _crop_front(img, crop)

    # source-px per mm on each axis (should match — crop aspect == front)
    px_per_mm_x = w / front_w_mm
    px_per_mm_y = h / front_h_mm
    ext_x = extend_mm * px_per_mm_x
    ext_y = extend_mm * px_per_mm_y

    x1 = int(round(x - ext_x)); y1 = int(round(y - ext_y))
    x2 = int(round(x + w + ext_x)); y2 = int(round(y + h + ext_y))

    pad_l = max(0, -x1)
    pad_t = max(0, -y1)
    pad_r = max(0, x2 - img.width)
    pad_b = max(0, y2 - img.height)
    x1c = max(0, x1); y1c = max(0, y1)
    x2c = min(img.width, x2); y2c = min(img.height, y2)

    region = img.crop((x1c, y1c, x2c, y2c))
    if pad_l or pad_t or pad_r or pad_b:
        new_w = region.width + pad_l + pad_r
        new_h = region.height + pad_t + pad_b
        padded = Image.new("RGB", (new_w, new_h), (255, 255, 255))
        padded.paste(region.convert("RGB"), (pad_l, pad_t))
        region = padded
    return region


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
def _oriented_front_mm(
    front_w_mm: float, front_h_mm: float, orientation: str | None
) -> tuple[float, float]:
    long_edge = max(front_w_mm, front_h_mm)
    short_edge = min(front_w_mm, front_h_mm)
    if (orientation or "landscape").lower() == "portrait":
        return (short_edge, long_edge)
    return (long_edge, short_edge)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _render_canvas_pdf(
    out_pdf: Path,
    face_img: Image.Image,
    front_w_mm: float,
    front_h_mm: float,
    wrap_mm: float,
    bleed_mm: float,
    wrap_mode: str,
    wrap_color_hex: str | None,
) -> dict[str, Any]:
    """Render one canvas as a single-page CMYK PDF."""
    mode = (wrap_mode or "no_edge_print").lower()

    if mode == "no_edge_print":
        page_w_mm = front_w_mm
        page_h_mm = front_h_mm
        side_mm = 0.0
    else:
        side_mm = wrap_mm + bleed_mm
        page_w_mm = front_w_mm + 2 * side_mm
        page_h_mm = front_h_mm + 2 * side_mm

    page_w_pt = page_w_mm * mm
    page_h_pt = page_h_mm * mm

    c = rl_canvas.Canvas(str(out_pdf), pagesize=(page_w_pt, page_h_pt))

    # ── Background ────────────────────────────────────────────
    if mode == "colour_wrap":
        cyan, mag, yel, k = _hex_to_cmyk_tuple(wrap_color_hex)
        c.setFillColorCMYK(cyan, mag, yel, k)
    else:
        # White fill so any anti-alias / margin defaults to white,
        # not press default (which can be undefined).
        c.setFillColorCMYK(0, 0, 0, 0)
    c.rect(0, 0, page_w_pt, page_h_pt, fill=1, stroke=0)

    # ── Image placement ───────────────────────────────────────
    cmyk = _to_cmyk(face_img)
    buf = io.BytesIO()
    cmyk.save(buf, format="JPEG", quality=92, optimize=True)
    buf.seek(0)
    reader = ImageReader(buf)

    if mode == "gallery_wrap":
        # Image was pre-extended to full page including bleed.
        c.drawImage(
            reader, 0, 0,
            width=page_w_pt, height=page_h_pt,
            preserveAspectRatio=False, anchor="c", mask=None,
        )
    else:
        # Front-only, centred (no_edge_print & colour_wrap).
        front_w_pt = front_w_mm * mm
        front_h_pt = front_h_mm * mm
        x_off = (page_w_pt - front_w_pt) / 2.0
        y_off = (page_h_pt - front_h_pt) / 2.0
        c.drawImage(
            reader, x_off, y_off,
            width=front_w_pt, height=front_h_pt,
            preserveAspectRatio=False, anchor="c", mask=None,
        )

    c.showPage()
    c.save()

    return {
        "page_w_mm": round(page_w_mm, 3),
        "page_h_mm": round(page_h_mm, 3),
        "front_w_mm": round(front_w_mm, 3),
        "front_h_mm": round(front_h_mm, 3),
        "wrap_mm": wrap_mm,
        "bleed_mm": bleed_mm,
        "side_mm": side_mm,
        "wrap_mode": mode,
        "wrap_color_hex": wrap_color_hex if mode == "colour_wrap" else None,
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def assemble_canvas_prints(
    bundle,
    workspace: Workspace,
    job_number: str,
) -> tuple[list[str], dict[str, Any]]:
    """Assemble one print-ready PDF per canvas and upload each.

    Returns ``(storage_paths, report)`` where ``storage_paths`` is an
    ordered list matching ``spec.canvas_prints.canvases[]``.
    """
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    cp = cfg.get("canvas_prints")
    if not isinstance(cp, dict):
        raise ValueError("canvas-prints job is missing configuration.canvas_prints")

    canvases = cp.get("canvases") or []
    if not isinstance(canvases, list) or not canvases:
        raise ValueError("canvas-prints job has no canvases to assemble")

    storage = StorageService()

    paths: list[str] = []
    per_canvas_report: list[dict[str, Any]] = []

    for idx, entry in enumerate(canvases):
        if not isinstance(entry, dict):
            continue
        src = entry.get("original_storage_path")
        if not src:
            log.warning("canvas_prints: skipping canvas[%d] with no original_storage_path", idx)
            continue

        front_w_mm_raw = float(entry.get("frontWidthMm") or 0)
        front_h_mm_raw = float(entry.get("frontHeightMm") or 0)
        if front_w_mm_raw <= 0 or front_h_mm_raw <= 0:
            log.warning("canvas_prints: skipping canvas[%d] with zero front dimensions", idx)
            continue
        front_w_mm, front_h_mm = _oriented_front_mm(
            front_w_mm_raw, front_h_mm_raw, entry.get("pageOrientation"),
        )

        wrap_mm = float(entry.get("wrapMm") or 0)
        bleed_mm = float(entry.get("bleedMm") or DEFAULT_BLEED_MM)
        wrap_mode = str(entry.get("wrapMode") or "no_edge_print")
        wrap_color = entry.get("wrapColorHex")

        # Download source and orient.
        local_src = workspace.path(f"canvas-{idx:03d}-{Path(src).name}")
        storage.download(src, local_src)
        img = _load_and_orient(local_src, entry.get("rotation"))

        # Extract the pixels we'll actually print.
        crop = entry.get("croppedAreaPixels")
        if wrap_mode == "gallery_wrap" and isinstance(crop, dict):
            face_img = _extract_extended(
                img, crop, front_w_mm, front_h_mm, extend_mm=(wrap_mm + bleed_mm),
            )
        else:
            face_img = _crop_front(img, crop)

        out_pdf = workspace.path(f"canvas-{idx:03d}.pdf")
        geom = _render_canvas_pdf(
            out_pdf, face_img,
            front_w_mm=front_w_mm, front_h_mm=front_h_mm,
            wrap_mm=wrap_mm, bleed_mm=bleed_mm,
            wrap_mode=wrap_mode, wrap_color_hex=wrap_color,
        )

        storage_path = unique_name(
            f"production/print-ready/{job_number}/canvas-{idx + 1:02d}", ".pdf",
        )
        storage.upload(out_pdf, storage_path, "application/pdf")
        paths.append(storage_path)

        per_canvas_report.append({
            "index": idx,
            "file_name": entry.get("file_name"),
            "size_slug": entry.get("size_slug"),
            "quantity": entry.get("quantity"),
            "storage_path": storage_path,
            **geom,
        })

    if not paths:
        raise ValueError("canvas-prints job produced no renderable canvases")

    report = {
        "engine": "canvas_prints",
        "colour_space": "cmyk",
        "canvas_count": len(paths),
        "canvases": per_canvas_report,
    }
    return paths, report
