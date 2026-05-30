"""Photo-prints → print-ready PDF assembly.

Photo-prints jobs differ from document jobs: instead of source PDFs the
customer uploads raw images (JPEG/PNG/WebP/HEIC) and configures a
crop/rotation per photo plus a global print size, finish and border.

The order_jobs.configuration JSON carries the spec:

    configuration.photo_prints = {
      "print_size_slug": "4x6",
      "finish_slug":     "gloss",
      "border_slug":     "none" | "white_3mm",
      "photos": [
        {
          "id": "...",
          "original_storage_path": "tenants/.../uploads/foo.jpg",
          "file_name": "foo.jpg",
          "source_width_px": 4032,
          "source_height_px": 3024,
          "rotation": 0 | 90 | 180 | 270,
          "croppedAreaPixels": { "x": .., "y": .., "width": .., "height": .. },
          "quantity": 2,
          ...
        },
        ...
      ]
    }

We render one page per copy (photo.quantity pages per photo) at the
chosen print size in mm. The crop is applied to the source raster, the
border (if any) is rendered around the image inside the page.

The merged multi-page PDF is uploaded to
`production/print-ready/<job_number>/<uuid>.pdf` like the document path,
and the storage path is returned to the caller for persistence.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps
from pypdf import PdfWriter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.services.files import Workspace, unique_name
from app.services.storage import StorageService

log = logging.getLogger(__name__)

# Photo-print physical sizes in mm. Mirrors src/lib/photoPrints/sizes.ts
# (landscape orientation: width >= height). Page orientation per-photo is
# derived from the cropped aspect ratio.
PHOTO_PRINT_SIZES_MM: dict[str, tuple[float, float]] = {
    "4x6":  (152.0, 102.0),
    "5x7":  (178.0, 127.0),
    "6x8":  (203.0, 152.0),
    "8x10": (254.0, 203.0),
    "8x12": (305.0, 203.0),
    "a4":   (297.0, 210.0),
    "a3":   (420.0, 297.0),
}

# Border slug → inner white margin in mm. Anything else = 0 (full bleed).
BORDER_MM: dict[str, float] = {
    "none": 0.0,
    "white_3mm": 3.0,
}


def is_photo_prints_job(bundle) -> bool:
    """Return True when the bundle represents a photo-prints job."""
    job = bundle.job or {}
    if (job.get("product_category") or "").lower() == "photo-prints":
        return True
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    return isinstance(cfg.get("photo_prints"), dict)


def _resolve_size_mm(slug: str | None) -> tuple[float, float]:
    if slug and slug in PHOTO_PRINT_SIZES_MM:
        return PHOTO_PRINT_SIZES_MM[slug]
    # Sensible fallback: 4x6.
    log.warning("photo_prints: unknown print_size_slug=%r — falling back to 4x6", slug)
    return PHOTO_PRINT_SIZES_MM["4x6"]


def _load_and_orient(local_image: Path, rotation: float | int | None) -> Image.Image:
    img = Image.open(local_image)
    img = ImageOps.exif_transpose(img)  # honour EXIF orientation
    if rotation:
        try:
            r = int(rotation) % 360
        except (TypeError, ValueError):
            r = 0
        if r:
            # PIL.rotate is CCW; react-easy-crop rotation is CW. Negate
            # so the rendered output matches the customer's preview.
            img = img.rotate(-r, expand=True, resample=Image.BICUBIC)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    return img


def _apply_crop(img: Image.Image, crop: dict | None) -> Image.Image:
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


def _render_photo_page(
    out_pdf: Path,
    image: Image.Image,
    page_w_mm: float,
    page_h_mm: float,
    border_mm_val: float,
) -> None:
    """Render a one-page PDF containing the (already-cropped) image."""
    page_w_pt = page_w_mm * mm
    page_h_pt = page_h_mm * mm

    c = canvas.Canvas(str(out_pdf), pagesize=(page_w_pt, page_h_pt))

    # White background (mostly cosmetic for matte previews; presses ignore it).
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, page_w_pt, page_h_pt, fill=1, stroke=0)

    inset_pt = border_mm_val * mm
    inner_w_pt = max(1.0, page_w_pt - 2 * inset_pt)
    inner_h_pt = max(1.0, page_h_pt - 2 * inset_pt)

    # Reportlab accepts a PIL image only via ImageReader.
    from reportlab.lib.utils import ImageReader

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=92, optimize=True)
    buf.seek(0)
    reader = ImageReader(buf)

    # We sized the source image to the print frame's aspect already by
    # cropping to croppedAreaPixels, so a straight fill is correct.
    c.drawImage(
        reader,
        inset_pt,
        inset_pt,
        width=inner_w_pt,
        height=inner_h_pt,
        preserveAspectRatio=False,
        anchor="c",
        mask="auto",
    )
    c.showPage()
    c.save()


def assemble_photo_prints(
    bundle,
    workspace: Workspace,
    job_number: str,
) -> tuple[str, dict[str, Any]]:
    """Build the print-ready PDF for a photo-prints job and upload it.

    Returns ``(storage_path, report)``. Raises ``ValueError`` when the
    configuration is missing or has no usable photos.
    """
    cfg = bundle.configuration if isinstance(bundle.configuration, dict) else {}
    pp = cfg.get("photo_prints")
    if not isinstance(pp, dict):
        raise ValueError("photo-prints job is missing configuration.photo_prints")

    photos = pp.get("photos") or []
    if not isinstance(photos, list) or not photos:
        raise ValueError("photo-prints job has no photos to assemble")

    base_size_mm = _resolve_size_mm(pp.get("print_size_slug"))
    border_mm_val = BORDER_MM.get((pp.get("border_slug") or "none"), 0.0)

    storage = StorageService()

    page_paths: list[Path] = []
    per_photo_report: list[dict[str, Any]] = []

    for idx, photo in enumerate(photos):
        if not isinstance(photo, dict):
            continue
        src_path = photo.get("original_storage_path")
        if not src_path:
            log.warning("photo_prints: skipping photo[%d] with no original_storage_path", idx)
            continue

        try:
            qty = max(1, int(photo.get("quantity") or 1))
        except (TypeError, ValueError):
            qty = 1

        local_src = workspace.path(f"photo-{idx:03d}-{Path(src_path).name}")
        storage.download(src_path, local_src)

        img = _load_and_orient(local_src, photo.get("rotation"))
        img = _apply_crop(img, photo.get("croppedAreaPixels"))

        # Pick page orientation from the cropped image aspect so we never
        # stretch a portrait crop onto a landscape page (or vice versa).
        long_mm, short_mm = max(base_size_mm), min(base_size_mm)
        if img.height > img.width:
            page_w_mm, page_h_mm = short_mm, long_mm  # portrait
        else:
            page_w_mm, page_h_mm = long_mm, short_mm  # landscape

        page_pdf = workspace.path(f"photo-{idx:03d}.pdf")
        _render_photo_page(page_pdf, img, page_w_mm, page_h_mm, border_mm_val)

        # One page per copy.
        for copy_idx in range(qty):
            if copy_idx == 0:
                page_paths.append(page_pdf)
            else:
                # Re-use the same single-page PDF — pypdf will append by reference.
                page_paths.append(page_pdf)

        per_photo_report.append({
            "file_name": photo.get("file_name"),
            "quantity": qty,
            "page_w_mm": page_w_mm,
            "page_h_mm": page_h_mm,
            "border_mm": border_mm_val,
            "cropped_to_px": (
                {
                    "w": int(img.width),
                    "h": int(img.height),
                }
            ),
        })

    if not page_paths:
        raise ValueError("photo-prints job produced no renderable pages")

    # Merge all single-page PDFs into one.
    merged_local = workspace.path("photo-prints-merged.pdf")
    writer = PdfWriter()
    for p in page_paths:
        writer.append(str(p))
    with open(merged_local, "wb") as f:
        writer.write(f)

    storage_path = unique_name(f"production/print-ready/{job_number}", ".pdf")
    storage.upload(merged_local, storage_path, "application/pdf")

    report = {
        "engine": "photo_prints",
        "print_size_slug": pp.get("print_size_slug"),
        "finish_slug": pp.get("finish_slug"),
        "border_slug": pp.get("border_slug"),
        "border_mm": border_mm_val,
        "base_size_mm": list(base_size_mm),
        "photos": per_photo_report,
        "total_pages": len(page_paths),
    }
    return storage_path, report
