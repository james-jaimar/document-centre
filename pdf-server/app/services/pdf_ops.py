from __future__ import annotations

import subprocess
from io import BytesIO
from pathlib import Path
from typing import Iterable

from PIL import Image
import pikepdf
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.lib.colors import Color
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.core.config import settings

ICC_DIR = Path("/opt/document-centre-api/icc")


def resolve_icc_profile(icc_profile: str | None) -> str | None:
    if not icc_profile:
        return None

    candidate = Path(icc_profile).expanduser()
    if candidate.is_absolute() and candidate.exists():
        return str(candidate)

    mapped = ICC_DIR / icc_profile
    if mapped.exists():
        return str(mapped)

    return None


class PdfOps:
    def office_to_pdf(self, src: Path, out_dir: Path) -> Path:
        """
        Convert an Office document (doc/docx/ppt/pptx/odt/odp/ods/xls/xlsx/rtf)
        to PDF using headless LibreOffice.

        Uses a per-call -env:UserInstallation profile so concurrent conversions
        do not collide on LibreOffice's user-profile lock file.

        FilterData passed to writer_pdf_Export forces:
          - All fonts embedded (EmbedStandardFonts, no font subsetting issues)
          - Tagged PDF 1.7 output (UseTaggedPDF, SelectPdfVersion=17)
          - Form fields stripped (ExportFormFields=false)
        These are critical so the downstream CMYK pass keeps text vector +
        K-only rather than rasterising.
        """
        import tempfile
        import shutil
        from urllib.parse import quote

        out_dir.mkdir(parents=True, exist_ok=True)
        profile_dir = Path(tempfile.mkdtemp(prefix="lo-profile-"))
        try:
            user_installation = f"-env:UserInstallation=file://{quote(str(profile_dir))}"
            # FilterData JSON must be wrapped in the convert-to filter spec.
            # Format: pdf:writer_pdf_Export:{"Key":{"type":"boolean","value":"true"}, ...}
            filter_data = (
                'pdf:writer_pdf_Export:'
                '{'
                '"EmbedStandardFonts":{"type":"boolean","value":"true"},'
                '"SelectPdfVersion":{"type":"long","value":"17"},'
                '"UseTaggedPDF":{"type":"boolean","value":"true"},'
                '"ExportFormFields":{"type":"boolean","value":"false"}'
                '}'
            )
            subprocess.run(
                [
                    settings.libreoffice_bin,
                    user_installation,
                    "--headless",
                    "--nologo",
                    "--nofirststartwizard",
                    "--norestore",
                    "--convert-to",
                    filter_data,
                    "--outdir",
                    str(out_dir),
                    str(src),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=300,
            )
        finally:
            shutil.rmtree(profile_dir, ignore_errors=True)

        produced = out_dir / (src.stem + ".pdf")
        if not produced.exists():
            raise RuntimeError(
                f"LibreOffice did not produce expected output: {produced}"
            )
        return produced

    def image_to_pdf(
        self,
        src: Path,
        out_pdf: Path,
        page_width_mm: float | None = None,
        page_height_mm: float | None = None,
        fit_mode: str = "fit",
    ) -> Path:
        image = Image.open(src)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        if not page_width_mm or not page_height_mm:
            image.save(out_pdf, "PDF", resolution=300.0)
            return out_pdf

        w_pt = page_width_mm * mm
        h_pt = page_height_mm * mm
        c = canvas.Canvas(str(out_pdf), pagesize=(w_pt, h_pt))

        iw, ih = image.size
        sx = w_pt / iw
        sy = h_pt / ih
        scale = min(sx, sy) if fit_mode == "fit" else max(sx, sy)

        draw_w = iw * scale
        draw_h = ih * scale
        x = (w_pt - draw_w) / 2
        y = (h_pt - draw_h) / 2

        tmp = src if src.suffix.lower() in {".jpg", ".jpeg", ".png"} else src.with_suffix(".jpg")
        if tmp != src:
            image.save(tmp, "JPEG", quality=95)

        c.drawImage(str(tmp), x, y, draw_w, draw_h)
        c.showPage()
        c.save()
        return out_pdf

    def inspect(self, src: Path) -> dict:
        with pikepdf.open(src) as pdf:
            page = pdf.pages[0]
            info = {
                "encrypted": pdf.is_encrypted,
                "page_count": len(pdf.pages),
                "pdf_version": pdf.pdf_version,
                "boxes": {},
            }

            for name in ("MediaBox", "CropBox", "TrimBox", "BleedBox", "ArtBox"):
                box = getattr(page, name, None)
                if box:
                    info["boxes"][name] = list(map(float, box))

            media = page.MediaBox
            info["width_pt"] = float(media[2] - media[0])
            info["height_pt"] = float(media[3] - media[1])
            return info

    def normalize_pdf(self, src: Path, out_pdf: Path, *, fast: bool = True) -> Path:
        """
        Normalize a PDF for downstream processing.

        Fast path (default): try `qpdf --linearize` only. This is ~10-50x
        faster than the Ghostscript rewrite for clean modern PDFs. We only
        fall back to the heavy Ghostscript pdfwrite pass when qpdf can't
        produce a usable file (encrypted, malformed, or qpdf isn't installed).
        """
        if fast:
            try:
                # qpdf --linearize writes a brand new file (web-optimised, no
                # in-place mutation of the source) — safer than --replace-input
                # for downstream parallel readers.
                proc = subprocess.run(
                    [settings.qpdf_bin, "--linearize", str(src), str(out_pdf)],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                # qpdf returns 3 for "warnings only" — still a valid output.
                if proc.returncode in (0, 3) and out_pdf.exists() and out_pdf.stat().st_size > 0:
                    return out_pdf
            except Exception:
                pass  # fall through to GS rewrite

        # Heavy fallback: full Ghostscript rewrite (rebuilds the PDF tree;
        # fixes encrypted / malformed / weird producer issues).
        subprocess.run(
            [
                settings.ghostscript_bin,
                "-dBATCH",
                "-dNOPAUSE",
                "-sDEVICE=pdfwrite",
                "-o",
                str(out_pdf),
                str(src),
            ],
            check=True,
        )
        return out_pdf

    def merge(self, files: Iterable[Path], out_pdf: Path) -> Path:
        writer = PdfWriter()
        for file in files:
            reader = PdfReader(str(file))
            for page in reader.pages:
                writer.add_page(page)

        with open(out_pdf, "wb") as f:
            writer.write(f)
        return out_pdf

    def rotate(self, src: Path, out_pdf: Path, angle: int) -> Path:
        reader = PdfReader(str(src))
        writer = PdfWriter()

        for page in reader.pages:
            page.rotate(angle)
            writer.add_page(page)

        with open(out_pdf, "wb") as f:
            writer.write(f)
        return out_pdf

    def normalize_orientation(
        self,
        src: Path,
        out_pdf: Path,
        dominant: str = "portrait",
    ) -> dict:
        """
        Rotate pages whose orientation doesn't match the dominant orientation
        so they all stack the same way up. Rotation is 90° clockwise (the
        client's chosen convention for CCW vs CW — we use CW).

        - dominant='portrait' (default): rotate landscape pages (w > h) +90 CW.
        - dominant='landscape': rotate portrait pages (w < h) +90 CW.

        Returns: { 'pages_rotated': int, 'total_pages': int, 'skipped': bool }.
        """
        reader = PdfReader(str(src))
        writer = PdfWriter()
        rotated = 0
        for page in reader.pages:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            is_landscape = w > h
            needs_rotate = (
                (dominant == "portrait" and is_landscape)
                or (dominant == "landscape" and not is_landscape)
            )
            if needs_rotate:
                page.rotate(90)  # 90° clockwise
                rotated += 1
            writer.add_page(page)

        with open(out_pdf, "wb") as f:
            writer.write(f)

        return {
            "pages_rotated": rotated,
            "total_pages": len(reader.pages),
            "skipped": rotated == 0,
        }

    def grayscale(self, src: Path, out_pdf: Path) -> Path:
        subprocess.run(
            [
                settings.ghostscript_bin,
                "-dBATCH",
                "-dNOPAUSE",
                "-sDEVICE=pdfwrite",
                "-sColorConversionStrategy=Gray",
                "-dProcessColorModel=/DeviceGray",
                "-o",
                str(out_pdf),
                str(src),
            ],
            check=True,
        )
        return out_pdf


    def rgb_to_cmyk(self, src: Path, out_pdf: Path, icc_profile: str | None = None) -> Path:
        resolved_icc = resolve_icc_profile(icc_profile)

        cmd = [
            settings.ghostscript_bin,
            "-dBATCH",
            "-dNOPAUSE",
            "-sDEVICE=pdfwrite",
            "-sColorConversionStrategy=CMYK",
            "-o",
            str(out_pdf),
        ]

        if resolved_icc:
            cmd.append(f"-sDefaultCMYKProfile={resolved_icc}")
            cmd.append("-dOverrideICC=true")

        cmd.append(str(src))
        subprocess.run(cmd, check=True)
        return out_pdf

    def rasterize_preview(
        self,
        src: Path,
        out_prefix: Path,
        dpi: int = 120,
        fmt: str = "png",
        first_page: int | None = None,
        last_page: int | None = None,
    ) -> list[Path]:
        """
        Rasterize PDF pages with Ghostscript. Optional first_page/last_page
        let callers do a "page-1 fast path" or chunked parallel renders
        without re-running on the whole document.
        """
        out_prefix.parent.mkdir(parents=True, exist_ok=True)
        pattern = str(out_prefix) + "-%03d." + fmt
        device = "png16m" if fmt == "png" else "jpeg"

        cmd = [
            settings.ghostscript_bin,
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            f"-r{dpi}",
            f"-sDEVICE={device}",
            f"-sOutputFile={pattern}",
        ]
        if first_page is not None:
            cmd.append(f"-dFirstPage={first_page}")
        if last_page is not None:
            cmd.append(f"-dLastPage={last_page}")
        cmd.append(str(src))

        subprocess.run(cmd, check=True)
        return sorted(out_prefix.parent.glob(out_prefix.name + "-*." + fmt))

    def downscale_to_thumbnail(
        self,
        src_image: Path,
        out_image: Path,
        target_max_dim: int = 360,
    ) -> tuple[int, int]:
        """
        Downscale a preview-resolution PNG to a thumbnail using PIL.
        Replaces a second Ghostscript pass — ~20-100x faster.
        Returns (width, height) of the resulting thumbnail.
        """
        with Image.open(src_image) as im:
            im = im.convert("RGB") if im.mode not in ("RGB", "L") else im
            im.thumbnail((target_max_dim, target_max_dim), Image.LANCZOS)
            im.save(out_image, "PNG", optimize=True)
            return im.size

    def resize_pages(
        self,
        src: Path,
        out_pdf: Path,
        width_mm: float,
        height_mm: float,
        fit_mode: str = "fit",
    ) -> Path:
        reader = PdfReader(str(src))
        writer = PdfWriter()
        target_w = width_mm * mm
        target_h = height_mm * mm

        for page in reader.pages:
            src_w = float(page.mediabox.width)
            src_h = float(page.mediabox.height)

            sx = target_w / src_w
            sy = target_h / src_h
            scale = min(sx, sy) if fit_mode == "fit" else max(sx, sy)

            page.scale_by(scale)
            page.transfer_rotation_to_content()

            new_page = writer.add_blank_page(width=target_w, height=target_h)
            tx = (target_w - float(page.mediabox.width)) / 2
            ty = (target_h - float(page.mediabox.height)) / 2
            new_page.merge_transformed_page(page, Transformation().translate(tx, ty))

        with open(out_pdf, "wb") as f:
            writer.write(f)
        return out_pdf

    def nup(
        self,
        src: Path,
        out_pdf: Path,
        columns: int,
        rows: int,
        page_width_mm: float,
        page_height_mm: float,
        margin_mm: float = 5,
    ) -> Path:
        reader = PdfReader(str(src))
        writer = PdfWriter()

        sheet_w = page_width_mm * mm
        sheet_h = page_height_mm * mm
        margin = margin_mm * mm
        slot_w = (sheet_w - margin * 2) / columns
        slot_h = (sheet_h - margin * 2) / rows

        pages = list(reader.pages)
        per_sheet = columns * rows

        for i in range(0, len(pages), per_sheet):
            sheet = writer.add_blank_page(width=sheet_w, height=sheet_h)
            chunk = pages[i : i + per_sheet]

            for idx, page in enumerate(chunk):
                col = idx % columns
                row = idx // columns
                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)
                scale = min(slot_w / pw, slot_h / ph)

                x = margin + col * slot_w + (slot_w - pw * scale) / 2
                y = sheet_h - margin - (row + 1) * slot_h + (slot_h - ph * scale) / 2

                sheet.merge_transformed_page(page, Transformation().scale(scale).translate(x, y))

        with open(out_pdf, "wb") as f:
            writer.write(f)
        return out_pdf

    def impose_sheet_with_bleed(
        self,
        src: Path,
        out_pdf: Path,
        columns: int,
        rows: int,
        sheet_width_mm: float,
        sheet_height_mm: float,
        bleed_mm: float = 3,
        gap_mm: float = 2,
        outer_margin_mm: float = 8,
        show_crop_marks: bool = True,
        show_bleed_outline: bool = False,
    ) -> Path:
        reader = PdfReader(str(src))
        pages = list(reader.pages)
        if not pages:
            raise ValueError("PDF has no pages")

        writer = PdfWriter()
        sheet_w = sheet_width_mm * mm
        sheet_h = sheet_height_mm * mm
        bleed = bleed_mm * mm
        gap = gap_mm * mm
        outer = outer_margin_mm * mm

        slot_w = (sheet_w - (outer * 2) - (gap * (columns - 1))) / columns
        slot_h = (sheet_h - (outer * 2) - (gap * (rows - 1))) / rows
        trim_w = max(slot_w - (2 * bleed), 1)
        trim_h = max(slot_h - (2 * bleed), 1)
        per_sheet = columns * rows

        for start in range(0, len(pages), per_sheet):
            sheet = writer.add_blank_page(width=sheet_w, height=sheet_h)

            overlay_buf = BytesIO()
            c = canvas.Canvas(overlay_buf, pagesize=(sheet_w, sheet_h))
            c.setLineWidth(0.4)
            c.setStrokeColor(Color(0, 0, 0, alpha=1))

            chunk = pages[start : start + per_sheet] if len(pages) > 1 else [pages[0]] * per_sheet

            for idx, page in enumerate(chunk):
                col = idx % columns
                row = idx // columns

                x0 = outer + col * (slot_w + gap)
                y0 = sheet_h - outer - ((row + 1) * slot_h) - (row * gap)

                trim_x = x0 + bleed
                trim_y = y0 + bleed

                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)
                scale = min(trim_w / pw, trim_h / ph)

                tx = trim_x + (trim_w - pw * scale) / 2
                ty = trim_y + (trim_h - ph * scale) / 2
                sheet.merge_transformed_page(page, Transformation().scale(scale).translate(tx, ty))

                if show_bleed_outline:
                    c.rect(x0, y0, slot_w, slot_h, stroke=1, fill=0)

                if show_crop_marks:
                    mark = 5 * mm

                    # bottom-left
                    c.line(trim_x - mark, trim_y, trim_x, trim_y)
                    c.line(trim_x, trim_y - mark, trim_x, trim_y)

                    # bottom-right
                    c.line(trim_x + trim_w, trim_y, trim_x + trim_w + mark, trim_y)
                    c.line(trim_x + trim_w, trim_y - mark, trim_x + trim_w, trim_y)

                    # top-left
                    c.line(trim_x - mark, trim_y + trim_h, trim_x, trim_y + trim_h)
                    c.line(trim_x, trim_y + trim_h, trim_x, trim_y + trim_h + mark)

                    # top-right
                    c.line(trim_x + trim_w, trim_y + trim_h, trim_x + trim_w + mark, trim_y + trim_h)
                    c.line(trim_x + trim_w, trim_y + trim_h, trim_x + trim_w, trim_y + trim_h + mark)

            c.showPage()
            c.save()

            overlay_buf.seek(0)
            overlay_pdf = PdfReader(overlay_buf)
            sheet.merge_page(overlay_pdf.pages[0])

        with open(out_pdf, "wb") as f:
            writer.write(f)

        return out_pdf

    def booklet(self, src: Path, out_pdf: Path, sheet_width_mm: float, sheet_height_mm: float) -> Path:
        reader = PdfReader(str(src))
        pages = list(reader.pages)
        writer = PdfWriter()

        while len(pages) % 4 != 0:
            pages.append(None)

        sheet_w = sheet_width_mm * mm
        sheet_h = sheet_height_mm * mm
        half_w = sheet_w / 2

        left_index = 0
        right_index = len(pages) - 1

        while left_index < right_index:
            # front side: last, first
            front = writer.add_blank_page(width=sheet_w, height=sheet_h)
            left_page = pages[right_index]
            right_page = pages[left_index]

            if left_page is not None:
                lpw = float(left_page.mediabox.width)
                lph = float(left_page.mediabox.height)
                scale = min(half_w / lpw, sheet_h / lph)
                x = (half_w - lpw * scale) / 2
                y = (sheet_h - lph * scale) / 2
                front.merge_transformed_page(left_page, Transformation().scale(scale).translate(x, y))

            if right_page is not None:
                rpw = float(right_page.mediabox.width)
                rph = float(right_page.mediabox.height)
                scale = min(half_w / rpw, sheet_h / rph)
                x = half_w + (half_w - rpw * scale) / 2
                y = (sheet_h - rph * scale) / 2
                front.merge_transformed_page(right_page, Transformation().scale(scale).translate(x, y))

            left_index += 1
            right_index -= 1

            # back side: second, second-last
            back = writer.add_blank_page(width=sheet_w, height=sheet_h)
            left_page = pages[left_index]
            right_page = pages[right_index]

            if left_page is not None:
                lpw = float(left_page.mediabox.width)
                lph = float(left_page.mediabox.height)
                scale = min(half_w / lpw, sheet_h / lph)
                x = (half_w - lpw * scale) / 2
                y = (sheet_h - lph * scale) / 2
                back.merge_transformed_page(left_page, Transformation().scale(scale).translate(x, y))

            if right_page is not None:
                rpw = float(right_page.mediabox.width)
                rph = float(right_page.mediabox.height)
                scale = min(half_w / rpw, sheet_h / rph)
                x = half_w + (half_w - rpw * scale) / 2
                y = (sheet_h - rph * scale) / 2
                back.merge_transformed_page(right_page, Transformation().scale(scale).translate(x, y))

            left_index += 1
            right_index -= 1

        with open(out_pdf, "wb") as f:
            writer.write(f)

        return out_pdf


    def crop_to_box(self, src: Path, out_pdf: Path, box: list[float]) -> Path:
        """Crop all pages to the given box [x0, y0, x1, y1]. Writes a NEW file; source is untouched."""
        with pikepdf.open(src) as pdf:
            for page in pdf.pages:
                page.MediaBox = box
                page.CropBox = box
                for attr in ('TrimBox', 'BleedBox'):
                    if hasattr(page, attr):
                        del page[f'/{attr}']
            pdf.save(out_pdf)
        return out_pdf

    def to_print_ready_cmyk(
        self,
        src: Path,
        out_pdf: Path,
        *,
        dest_profile: str = "fogra39",
        intent: str = "relative_colorimetric",
        preserve_black: bool = True,
    ) -> dict:
        """
        Convert a PDF to print-ready CMYK using Ghostscript.

        Key Ghostscript flags:
          - sColorConversionStrategy=CMYK + sProcessColorModel=DeviceCMYK:
              force the output to CMYK device space.
          - dOverrideICC=true + sOutputICCProfile=<dest>:
              tag the output with the chosen destination profile (Fogra 39 etc).
          - sDefaultRGBProfile=<sRGB>:
              treat untagged RGB content as sRGB during conversion.
          - dRenderIntent=<n>:
              0=Perceptual, 1=Relative Colorimetric, 2=Saturation, 3=Absolute.
          - dBlackPtComp=true:
              black point compensation — preserves shadow detail.
          - dKPreserve=2 (when preserve_black):
              "K-only stays K-only" — black text stays single-channel K
              (critical for crisp laser/inkjet text).
          - dPreserveOverprintSettings=true:
              keep overprint instructions (important for spot colours).
          - dPDFSETTINGS=/prepress:
              prepress-quality presets (high-resolution images, embed fonts).

        Returns a dict suitable for storing as the job result.
        """
        from app.services.icc_profiles import resolve_profile, resolve_intent

        dest_path = resolve_profile(dest_profile)
        rgb_path = resolve_profile("srgb")
        intent_value = resolve_intent(intent)

        cmd = [
            settings.ghostscript_bin,
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-sDEVICE=pdfwrite",
            "-dPDFSETTINGS=/prepress",
            "-dCompatibilityLevel=1.7",
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            "-dOverrideICC=true",
            f"-sDefaultRGBProfile={rgb_path}",
            f"-sOutputICCProfile={dest_path}",
            f"-dRenderIntent={intent_value}",
            "-dBlackPtComp=true",
            "-dPreserveOverprintSettings=true",
        ]
        if preserve_black:
            cmd.append("-dKPreserve=2")

        cmd.extend(["-o", str(out_pdf), str(src)])

        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)

        return {
            "dest_profile": dest_profile,
            "intent": intent,
            "preserve_black": preserve_black,
            "before_size": src.stat().st_size,
            "after_size": out_pdf.stat().st_size,
            "gs_stderr": proc.stderr[-2000:] if proc.stderr else None,
        }


pdf_ops = PdfOps()
