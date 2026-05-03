from __future__ import annotations

import logging
import random
import subprocess
import time
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

logger = logging.getLogger(__name__)


class RasterizationIncompleteError(RuntimeError):
    """Raised when Ghostscript could not produce every requested page even
    after per-page retries. Carries the list of missing 1-based page numbers
    so the caller can decide whether to salvage them another way."""

    def __init__(self, missing_pages: list[int]):
        super().__init__(
            f"Ghostscript produced an incomplete page set; missing pages: {missing_pages}"
        )
        self.missing_pages = missing_pages

ICC_DIR = Path("/opt/document-centre-api/icc")


# ---------------------------------------------------------------------------
# Orientation helpers
# ---------------------------------------------------------------------------
# CRITICAL: PDF page orientation is determined by MediaBox + /Rotate, NOT by
# MediaBox alone. LibreOffice (and many other producers) export landscape
# pages as a PORTRAIT MediaBox (e.g. 595×842) plus a `/Rotate 90` viewer hint.
# Reading raw MediaBox.width vs height misclassifies them as portrait, which
# was the root cause of repeated "landscape pages get cropped to portrait"
# bugs across resize/normalize_orientation/crop_to_box.
#
# Always use `_effective_dims_*` when deciding orientation or building boxes.

def _effective_dims_pikepdf(page) -> tuple[float, float]:
    """Return the page's VISUAL (width, height) honouring /Rotate. pikepdf API."""
    mb = page.MediaBox
    w = float(mb[2]) - float(mb[0])
    h = float(mb[3]) - float(mb[1])
    rot = 0
    try:
        rot = int(page.get("/Rotate", 0) or 0) % 360
    except Exception:
        rot = 0
    if rot in (90, 270):
        return h, w
    return w, h


def _effective_dims_pypdf(page) -> tuple[float, float]:
    """Return the page's VISUAL (width, height) honouring /Rotate. pypdf API."""
    w = float(page.mediabox.width)
    h = float(page.mediabox.height)
    rot = 0
    try:
        # pypdf exposes /Rotate via page.rotation in some versions; use the
        # raw dict get() for portability.
        raw = page.get("/Rotate", 0)
        rot = int(raw or 0) % 360
    except Exception:
        rot = 0
    if rot in (90, 270):
        return h, w
    return w, h


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
                "pdf_version": str(pdf.pdf_version),
                "boxes": {},
            }

            for name in ("MediaBox", "CropBox", "TrimBox", "BleedBox", "ArtBox"):
                box = getattr(page, name, None)
                if box:
                    info["boxes"][name] = list(map(float, box))

            # Top-level width_pt/height_pt reflect VISUAL dimensions of page 1
            # (honouring /Rotate), so the client's "first page is portrait"
            # heuristic matches what users actually see.
            eff_w, eff_h = _effective_dims_pikepdf(page)
            info["width_pt"] = eff_w
            info["height_pt"] = eff_h

            # Per-page geometry so the client can detect mixed orientations
            # (e.g. Word docs with landscape table sections among portrait
            # body pages). width_pt/height_pt are EFFECTIVE (post-/Rotate)
            # so a Word landscape table page emitted as portrait MediaBox +
            # /Rotate 90 is correctly classified as landscape.
            pages_meta = []
            has_portrait = False
            has_landscape = False
            for p in pdf.pages:
                pmb = p.MediaBox
                raw_w = float(pmb[2] - pmb[0])
                raw_h = float(pmb[3] - pmb[1])
                rot = 0
                try:
                    rot = int(p.get("/Rotate", 0) or 0)
                except Exception:
                    rot = 0
                eff_w_p, eff_h_p = _effective_dims_pikepdf(p)
                pages_meta.append({
                    "width_pt": eff_w_p,
                    "height_pt": eff_h_p,
                    "raw_width_pt": raw_w,
                    "raw_height_pt": raw_h,
                    "rotate": rot,
                })
                if eff_w_p > eff_h_p:
                    has_landscape = True
                elif eff_w_p < eff_h_p:
                    has_portrait = True
            info["pages"] = pages_meta
            info["mixed_orientation"] = has_portrait and has_landscape
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
                "-dAutoRotatePages=/None",
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
        so they all stack the same way up. Rotation is 90° clockwise.

        - dominant='portrait' (default): rotate landscape pages (w > h) +90 CW.
        - dominant='landscape': rotate portrait pages (w < h) +90 CW.

        Implementation:
          1. Bake any /Rotate hint into the content stream so visual geometry
             matches the page's MediaBox. (LibreOffice exports landscape
             Office pages as portrait MediaBox + /Rotate 90 — without baking,
             every downstream check is wrong.)
          2. For each page that needs rotating, COMPOSITE the content onto a
             freshly allocated blank page whose dimensions are swapped, using
             a content transform (rotate + translate) so the bytes on disk
             have a stable MediaBox and NO residual /Rotate hint.
          3. Carry the original page's TrimBox / BleedBox / CropBox / ArtBox
             through the rotation so downstream `derive_default_render_box`
             can still trim previews to the finished page edge.

        Returns: { 'pages_rotated': int, 'total_pages': int, 'skipped': bool }.
        """
        # We use pypdf for the rotate-and-composite (it has a clean
        # transform API), then re-open with pikepdf afterwards to STAMP
        # every declared box (TrimBox/BleedBox/CropBox/ArtBox) onto the
        # output pages. Setting boxes via pypdf attribute assignment was
        # unreliable in practice — the rotated file ended up with only a
        # MediaBox, which broke `derive_default_render_box` and forced
        # previews to render the bleed/crop-mark canvas.

        BOX_KEYS = ("/TrimBox", "/BleedBox", "/CropBox", "/ArtBox")

        # ── Snapshot original per-page geometry from pikepdf BEFORE we
        # mutate anything — this is the authoritative box data we'll
        # transform and write back onto the output. ──
        per_page_pre: list[dict] = []
        with pikepdf.open(src) as src_pdf:
            for page in src_pdf.pages:
                mb = page.MediaBox
                raw_w = float(mb[2]) - float(mb[0])
                raw_h = float(mb[3]) - float(mb[1])
                try:
                    rot = int(page.get("/Rotate", 0) or 0) % 360
                except Exception:
                    rot = 0
                # Effective (visual) dimensions accounting for /Rotate.
                if rot in (90, 270):
                    eff_w, eff_h = raw_h, raw_w
                else:
                    eff_w, eff_h = raw_w, raw_h
                boxes: dict[str, list[float]] = {}
                for key in BOX_KEYS:
                    raw = page.get(key)
                    if not raw:
                        continue
                    try:
                        boxes[key] = [
                            float(raw[0]), float(raw[1]),
                            float(raw[2]), float(raw[3]),
                        ]
                    except Exception:
                        continue
                per_page_pre.append({
                    "raw_w": raw_w,
                    "raw_h": raw_h,
                    "rot": rot,
                    "eff_w": eff_w,
                    "eff_h": eff_h,
                    "boxes": boxes,
                })

        reader = PdfReader(str(src))
        writer = PdfWriter()
        rotated = 0
        total = 0

        # Track per-output-page which transformation was applied so we can
        # stamp the correct boxes after writing. Each entry:
        #   { "rotated": bool, "src_w_visual": float, "src_h_visual": float,
        #     "boxes_visual": { "/TrimBox": [...], ... } }
        per_page_post: list[dict] = []

        def _bake_rotate_boxes(boxes: dict[str, list[float]],
                               raw_w: float, raw_h: float, rot: int
                               ) -> tuple[dict[str, list[float]], float, float]:
            """Map boxes declared in pre-/Rotate space into VISUAL space
            (i.e. as if /Rotate had been baked into content). Returns
            (visual_boxes, visual_w, visual_h)."""
            if rot == 0 or not boxes:
                return boxes, raw_w, raw_h
            out: dict[str, list[float]] = {}
            for k, b in boxes.items():
                x0, y0, x1, y1 = b
                if rot == 90:
                    # Visual (x', y') = (raw_h - y, x)  for 90° CCW bake of /Rotate=90
                    nx0, ny0 = raw_h - y1, x0
                    nx1, ny1 = raw_h - y0, x1
                elif rot == 180:
                    nx0, ny0 = raw_w - x1, raw_h - y1
                    nx1, ny1 = raw_w - x0, raw_h - y0
                elif rot == 270:
                    nx0, ny0 = y0, raw_w - x1
                    nx1, ny1 = y1, raw_w - x0
                else:
                    nx0, ny0, nx1, ny1 = x0, y0, x1, y1
                out[k] = [min(nx0, nx1), min(ny0, ny1),
                          max(nx0, nx1), max(ny0, ny1)]
            if rot in (90, 270):
                return out, raw_h, raw_w
            return out, raw_w, raw_h

        def _rotate_cw_box(box: list[float], src_w: float) -> list[float]:
            """Rotate a box by +90 CW (matches the content transform we
            apply). For any source point (x, y) on a page of width src_w,
            the new position is (y, src_w - x)."""
            x0, y0, x1, y1 = box
            nx0, ny0 = y0, src_w - x1
            nx1, ny1 = y1, src_w - x0
            return [min(nx0, nx1), min(ny0, ny1),
                    max(nx0, nx1), max(ny0, ny1)]

        for page_idx, page in enumerate(reader.pages):
            total += 1
            pre = per_page_pre[page_idx]

            # Step 1: bake /Rotate so mediabox matches visible content,
            # AND map declared boxes through the same bake so they live in
            # the visual coordinate frame.
            page.transfer_rotation_to_content()
            visual_boxes, vw, vh = _bake_rotate_boxes(
                pre["boxes"], pre["raw_w"], pre["raw_h"], pre["rot"],
            )

            is_landscape = vw > vh
            needs_rotate = (
                (dominant == "portrait" and is_landscape)
                or (dominant == "landscape" and not is_landscape)
            )

            if not needs_rotate:
                writer.add_page(page)
                per_page_post.append({
                    "rotated": False,
                    "boxes_out": visual_boxes,
                })
                continue

            # Step 2: composite onto a swapped-dimensions blank page with a
            # +90 CW content transform.
            new_page = writer.add_blank_page(width=vh, height=vw)
            transform = (
                Transformation()
                .rotate(-90)
                .translate(0, vw)
            )
            new_page.merge_transformed_page(page, transform)

            # Step 3: rotate the visual boxes by the same +90 CW transform.
            rotated_boxes: dict[str, list[float]] = {}
            for k, b in visual_boxes.items():
                rotated_boxes[k] = _rotate_cw_box(b, vw)
            per_page_post.append({
                "rotated": True,
                "boxes_out": rotated_boxes,
            })
            rotated += 1

        with open(out_pdf, "wb") as f:
            writer.write(f)

        # ── Post-pass: stamp boxes onto the output pages with pikepdf so
        # the saved file genuinely carries /TrimBox /BleedBox /CropBox
        # /ArtBox where they existed on the input. ──
        try:
            with pikepdf.open(out_pdf, allow_overwriting_input=True) as out_pdf_obj:
                for page_idx, post in enumerate(per_page_post):
                    if page_idx >= len(out_pdf_obj.pages):
                        break
                    page = out_pdf_obj.pages[page_idx]
                    for key, box in (post.get("boxes_out") or {}).items():
                        try:
                            page[key] = pikepdf.Array(
                                [float(box[0]), float(box[1]),
                                 float(box[2]), float(box[3])]
                            )
                        except Exception as exc:
                            logger.warning(
                                "normalize_orientation: failed to stamp %s on page %d: %s",
                                key, page_idx + 1, exc,
                            )
                out_pdf_obj.save(out_pdf)
        except Exception as exc:
            logger.warning(
                "normalize_orientation: pikepdf box stamp pass failed: %s", exc,
            )

        return {
            "pages_rotated": rotated,
            "total_pages": total,
            "skipped": rotated == 0,
        }

    def grayscale(self, src: Path, out_pdf: Path) -> Path:
        subprocess.run(
            [
                settings.ghostscript_bin,
                "-dBATCH",
                "-dNOPAUSE",
                "-dAutoRotatePages=/None",
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
            "-dAutoRotatePages=/None",
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

    def _gs_rasterize_pages(
        self,
        src: Path,
        out_prefix: Path,
        dpi: int,
        fmt: str,
        first_page: int | None,
        last_page: int | None,
    ) -> None:
        """Run a single Ghostscript invocation. No completeness check; the
        caller (`rasterize_preview`) verifies and retries any missing pages.

        IMPORTANT: Ghostscript's ``%03d`` in ``-sOutputFile`` is the
        *sequential output index* (always starts at 1), NOT the source
        page number. So a call with ``-dFirstPage=5 -dLastPage=5`` would
        write ``page-001.png``, not ``page-005.png`` — which silently
        confused both the per-page renderer and the completeness verifier
        and was the root cause of the "17 of 18 pages missing" failures
        seen with multi-page PDFs.

        Two cases:
          * Single-page render (first==last): write directly to a stable
            ``<prefix>-<NNN>.<fmt>`` file, no GS placeholder at all. This
            also makes parallel calls collision-free.
          * Multi-page batch: keep ``%03d`` for GS, then RENAME the
            sequentially-numbered outputs to use the source page number
            so downstream globbing sees the right files.
        """
        out_prefix.parent.mkdir(parents=True, exist_ok=True)
        device = "png16m" if fmt == "png" else "jpeg"

        # Single-page fast path — write directly with the source page
        # number embedded, no GS placeholder collision possible.
        if (
            first_page is not None
            and last_page is not None
            and first_page == last_page
        ):
            target = Path(f"{out_prefix}-{first_page:03d}.{fmt}")
            cmd = [
                settings.ghostscript_bin,
                "-dNOPAUSE",
                "-dBATCH",
                "-dSAFER",
                # Multi-thread the rasteriser. On a 4 vCPU host this gives
                # ~30-50% faster wall-clock for multi-page renders.
                "-dNumRenderingThreads=4",
                f"-r{dpi}",
                f"-sDEVICE={device}",
                f"-sOutputFile={target}",
                f"-dFirstPage={first_page}",
                f"-dLastPage={last_page}",
                str(src),
            ]
            subprocess.run(cmd, check=True)
            return

        # Multi-page batch — let GS use its sequential numbering, then
        # rename to source page numbers.
        pattern = str(out_prefix) + "-%03d." + fmt
        cmd = [
            settings.ghostscript_bin,
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-dNumRenderingThreads=4",
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

        # Re-map sequential indices → source page numbers.
        # GS produced files like <prefix>-001.png, -002.png, ... in order,
        # corresponding to source pages first_page, first_page+1, ...
        if first_page is not None and first_page != 1:
            base_dir = out_prefix.parent
            base_name = out_prefix.name
            existing = sorted(base_dir.glob(f"{base_name}-*.{fmt}"))
            # Identify the freshly written sequential files (those whose
            # trailing index falls in the GS sequential range 1..N where
            # N = (last_page or first_page) - first_page + 1).
            count = (last_page or first_page) - first_page + 1
            seq_to_src: list[tuple[Path, Path]] = []
            for i in range(1, count + 1):
                seq_path = base_dir / f"{base_name}-{i:03d}.{fmt}"
                src_page = first_page + i - 1
                target_path = base_dir / f"{base_name}-{src_page:03d}.{fmt}"
                if seq_path.exists() and seq_path != target_path:
                    seq_to_src.append((seq_path, target_path))
            # Rename in REVERSE so we don't clobber a still-needed seq
            # file (e.g. renaming -001 → -002 before -002 has been moved).
            for seq_path, target_path in reversed(seq_to_src):
                # If target already exists from a prior partial run,
                # remove it first — the fresh GS output supersedes it.
                if target_path.exists():
                    target_path.unlink()
                seq_path.rename(target_path)


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

        Hardened behaviour:
          * After the bulk Ghostscript run we glob the output dir and verify
            every requested page produced a file.
          * Any missing pages are re-rendered ONE AT A TIME (single-page GS
            invocations are extremely reliable) up to
            ``settings.preview_page_max_retries`` times with backoff.
          * If pages are still missing after all retries, raise
            ``RasterizationIncompleteError`` so the caller can decide
            whether to give up or try a different recovery path.
        """
        # Bulk run first — fast path for the common (no-failure) case.
        self._gs_rasterize_pages(src, out_prefix, dpi, fmt, first_page, last_page)

        if first_page is None and last_page is None:
            # No range hint — we can't verify completeness deterministically
            # without re-parsing the source. Return what we have; downstream
            # callers always supply explicit ranges.
            return sorted(out_prefix.parent.glob(out_prefix.name + "-*." + fmt))

        fp = first_page if first_page is not None else 1
        lp = last_page if last_page is not None else fp
        expected = set(range(fp, lp + 1))

        def _present_pages() -> set[int]:
            present: set[int] = set()
            for p in out_prefix.parent.glob(out_prefix.name + "-*." + fmt):
                stem = p.stem.rsplit("-", 1)[-1]
                if stem.isdigit():
                    present.add(int(stem))
            return present

        present = _present_pages()
        missing = sorted(expected - present)

        if not missing:
            return sorted(out_prefix.parent.glob(out_prefix.name + "-*." + fmt))

        # Per-page retry loop. Single-page GS invocations are basically
        # immune to the rare batch-mode glitches that cause skipped pages.
        max_retries = max(1, settings.preview_page_max_retries)
        base_ms = max(50, settings.preview_page_retry_base_ms)

        for attempt in range(1, max_retries + 1):
            logger.warning(
                "rasterize_preview: missing pages on attempt %d/%d → %s",
                attempt, max_retries, missing,
            )
            for page in missing:
                try:
                    self._gs_rasterize_pages(
                        src, out_prefix, dpi, fmt,
                        first_page=page, last_page=page,
                    )
                except subprocess.CalledProcessError as exc:
                    logger.warning(
                        "rasterize_preview: GS failed on page %d attempt %d: %s",
                        page, attempt, exc,
                    )
            present = _present_pages()
            missing = sorted(expected - present)
            if not missing:
                break
            # Backoff before the next sweep — exponential with jitter.
            delay = (base_ms * (2 ** (attempt - 1))) / 1000.0
            time.sleep(delay + random.uniform(0, delay * 0.25))

        if missing:
            raise RasterizationIncompleteError(missing_pages=missing)

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
        dominant_orientation: str | None = None,
    ) -> Path:
        """Resize each page onto a target canvas of (width_mm × height_mm).

        Page-aware AND rotation-aware: orientation is computed from EFFECTIVE
        dimensions (MediaBox honouring /Rotate). LibreOffice exports landscape
        Office pages as portrait MediaBox + /Rotate 90 — without honouring
        /Rotate, the orientation check misclassifies them and the landscape
        content gets squeezed into a portrait canvas (clipped at the bottom).

        When ``dominant_orientation`` is set (e.g. "portrait"), this function
        performs an ATOMIC rotate-then-resize in a single PDF write pass:
          1. Bake any /Rotate hint into the content stream.
          2. If the page's visual orientation doesn't match the dominant,
             rotate the content 90° CW onto a swapped-dimension canvas FIRST.
          3. THEN scale + centre the (now correctly oriented) content onto the
             final target canvas.

        This replaces the fragile multi-job handoff (normalize-orientation →
        resize → print-ready) where Ghostscript's pdfwrite device could
        "repair" pypdf's merge_transformed_page output and revert pages to
        their original landscape geometry.
        """
        reader = PdfReader(str(src))
        writer = PdfWriter()
        target_w_base = width_mm * mm
        target_h_base = height_mm * mm
        target_landscape = target_w_base > target_h_base

        force_portrait = dominant_orientation == "portrait"
        force_landscape_mode = dominant_orientation == "landscape"

        for page in reader.pages:
            # Step 1 — bake /Rotate into content. After this, page.mediabox
            # reflects VISUAL geometry and orientation checks are reliable.
            page.transfer_rotation_to_content()

            src_w = float(page.mediabox.width)
            src_h = float(page.mediabox.height)
            page_is_landscape = src_w > src_h

            # Step 2 — atomic rotation when dominant_orientation demands it.
            # Instead of relying on a separate normalize_orientation job
            # (whose output Ghostscript pdfwrite can corrupt), we rotate
            # the content HERE before scaling.
            needs_rotate = (
                (force_portrait and page_is_landscape)
                or (force_landscape_mode and not page_is_landscape)
            )

            if needs_rotate:
                # Rotate 90° CW: create a new page with swapped dimensions,
                # composite the old content with a rotate+translate transform.
                rotated_page = writer.add_blank_page(width=src_h, height=src_w)
                transform = (
                    Transformation()
                    .rotate(-90)
                    .translate(0, src_w)
                )
                rotated_page.merge_transformed_page(page, transform)

                # Now treat the rotated page as our source for scaling.
                # Read its dimensions (swapped from original).
                src_w, src_h = src_h, src_w
                page_is_landscape = src_w > src_h

                # Remove the blank page we just added to writer — we'll
                # re-add it properly below after scaling.
                # Actually, we need to work with rotated_page for scaling.
                # Remove it from writer, scale it, then add the final page.
                writer.pages.pop()
                page = rotated_page

            # Step 3 — pick same-orientation target canvas for this page.
            if force_portrait:
                # Always use portrait canvas
                tw = min(target_w_base, target_h_base)
                th = max(target_w_base, target_h_base)
            elif force_landscape_mode:
                # Always use landscape canvas
                tw = max(target_w_base, target_h_base)
                th = min(target_w_base, target_h_base)
            else:
                # Original behaviour: match page orientation
                if page_is_landscape == target_landscape:
                    tw, th = target_w_base, target_h_base
                else:
                    tw, th = target_h_base, target_w_base

            sx = tw / src_w
            sy = th / src_h
            scale = min(sx, sy) if fit_mode == "fit" else max(sx, sy)

            page.scale_by(scale)

            new_page = writer.add_blank_page(width=tw, height=th)
            tx = (tw - float(page.mediabox.width)) / 2
            ty = (th - float(page.mediabox.height)) / 2
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


    def derive_default_render_box(self, src: Path) -> list[float] | None:
        """Return a sensible default render box from the PDF's own metadata.

        Many design tools (InDesign, Illustrator, Affinity, etc.) export PDFs
        with a MediaBox that includes bleed and crop marks, and a TrimBox that
        marks the actual finished page edge. For previews we want to show the
        FINISHED page edge — i.e. crop to TrimBox (or BleedBox as a fallback)
        so users see edge-to-edge artwork instead of bleed/marks.

        Rules:
          - Look at page 1 only (the box is applied uniformly by crop_to_box,
            which is rotation/orientation-aware).
          - Prefer TrimBox if it is strictly inside MediaBox (≥1pt difference
            on any edge — guards against floating-point noise from PDFs where
            TrimBox == MediaBox).
          - Otherwise fall back to BleedBox under the same "strictly inside"
            rule.
          - Return None if neither box is present or both equal MediaBox, so
            we don't crop a clean PDF that has no bleed area.
        """
        try:
            with pikepdf.open(src) as pdf:
                if not len(pdf.pages):
                    return None
                page = pdf.pages[0]
                try:
                    mb = [float(v) for v in page.MediaBox]
                except Exception:
                    return None

                def _strictly_inside(box: list[float]) -> bool:
                    # ≥1pt smaller on at least one edge AND not larger than
                    # MediaBox on any edge.
                    if (
                        box[0] < mb[0] - 0.5 or box[1] < mb[1] - 0.5
                        or box[2] > mb[2] + 0.5 or box[3] > mb[3] + 0.5
                    ):
                        return False
                    smaller = (
                        (box[0] - mb[0]) > 1.0
                        or (box[1] - mb[1]) > 1.0
                        or (mb[2] - box[2]) > 1.0
                        or (mb[3] - box[3]) > 1.0
                    )
                    return smaller

                for name in ("TrimBox", "BleedBox"):
                    raw = getattr(page, name, None)
                    if not raw:
                        continue
                    try:
                        box = [float(v) for v in raw]
                    except Exception:
                        continue
                    if _strictly_inside(box):
                        return box
        except Exception:
            return None
        return None

    def crop_to_box(self, src: Path, out_pdf: Path, box: list[float]) -> Path:
        """Crop pages to the given box [x0, y0, x1, y1].

        Page-aware AND rotation-aware: orientation is computed from EFFECTIVE
        dimensions (MediaBox honouring /Rotate). LibreOffice exports landscape
        Office pages as portrait MediaBox + /Rotate 90; without honouring
        /Rotate, the orientation comparison misclassifies them and the
        landscape page gets its content guillotined off by a portrait crop.

        When a page's effective orientation differs from the box's, the box's
        width/height are swapped for that page so landscape pages keep their
        landscape canvas (and vice versa).

        IMPORTANT: pikepdf's MediaBox assignment with a swapped box on a
        page that has /Rotate set will still be interpreted by viewers as
        rotated content within that swapped box. We DO NOT mutate /Rotate
        here — downstream rasterizers handle it. The orientation match is
        about the box dimensions matching the visual page geometry so no
        content is clipped.

        Writes a NEW file; source is untouched.
        """
        bw = float(box[2]) - float(box[0])
        bh = float(box[3]) - float(box[1])
        box_landscape = bw > bh
        with pikepdf.open(src) as pdf:
            for page in pdf.pages:
                # Effective (visual) dimensions — accounts for /Rotate.
                eff_w, eff_h = _effective_dims_pikepdf(page)
                page_landscape = eff_w > eff_h
                if page_landscape == box_landscape:
                    eff = list(box)
                else:
                    # Swap dimensions so width/height align with this page.
                    eff = [float(box[0]), float(box[1]),
                           float(box[0]) + bh, float(box[1]) + bw]
                page.MediaBox = eff
                page.CropBox = eff
                for attr in ('TrimBox', 'BleedBox'):
                    if hasattr(page, attr):
                        del page[f'/{attr}']
            pdf.save(out_pdf)
        return out_pdf

    def _is_already_cmyk(self, src: Path) -> bool:
        """Best-effort check: True when every page's content uses only
        DeviceCMYK / DeviceGray / DeviceN ink space and there are no RGB
        ICC-based colour spaces or RGB-tagged images.

        Conservative — any uncertainty returns False so we still run the
        full Ghostscript CMYK pass. Cheap (no rendering): just walks the
        Resources/ColorSpace dictionary on each page.
        """
        try:
            with pikepdf.open(src) as pdf:
                for page in pdf.pages:
                    res = page.get("/Resources")
                    if res is None:
                        continue
                    # ColorSpace entries
                    cs = res.get("/ColorSpace") if hasattr(res, "get") else None
                    if cs is not None:
                        try:
                            for _name, value in cs.items():
                                s = repr(value)
                                # Any RGB-ish marker disqualifies the file.
                                if "DeviceRGB" in s or "/CalRGB" in s:
                                    return False
                                if "ICCBased" in s and "/N 3" in s:
                                    return False
                        except Exception:
                            return False
                    # Image XObjects
                    xo = res.get("/XObject") if hasattr(res, "get") else None
                    if xo is not None:
                        try:
                            for _n, obj in xo.items():
                                subtype = obj.get("/Subtype")
                                if str(subtype) != "/Image":
                                    continue
                                cs2 = obj.get("/ColorSpace")
                                if cs2 is None:
                                    continue
                                s = repr(cs2)
                                if "DeviceRGB" in s or "/CalRGB" in s:
                                    return False
                                if "ICCBased" in s and "/N 3" in s:
                                    return False
                        except Exception:
                            return False
            return True
        except Exception:
            return False

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
        Convert a PDF to print-ready CMYK using a staged Ghostscript fallback
        ladder. If a richer attempt fails (exit 255 with empty stderr is
        common on packaged GS builds), we drop the most fragile flags and try
        again. The last fallback is a plain `pdfwrite` normalize so uploads
        are never blocked outright — the result is flagged so the caller can
        warn the operator that no real CMYK conversion happened.

        Fast path: if the input is already CMYK/Gray throughout (very common
        for files exported from print-design tools like InDesign), we just
        copy the source to the output and skip Ghostscript entirely. This
        preserves CMYK fidelity for the customer preview without paying for
        the full pdfwrite rewrite.
        """
        from app.services.icc_profiles import resolve_profile, resolve_intent

        timings: dict[str, int] = {}
        t0 = time.monotonic()

        # ── Already-CMYK fast path ───────────────────────────────────
        if self._is_already_cmyk(src):
            try:
                out_pdf.write_bytes(src.read_bytes())
                timings["already_cmyk_copy"] = int((time.monotonic() - t0) * 1000)
                return {
                    "dest_profile": dest_profile,
                    "intent": intent,
                    "preserve_black": preserve_black,
                    "before_size": src.stat().st_size,
                    "after_size": out_pdf.stat().st_size,
                    "attempt": "already_cmyk",
                    "icc_converted": True,
                    "fallback_used": False,
                    "diagnostics": [],
                    "timings_ms": timings,
                }
            except Exception as exc:
                logger.warning(
                    "to_print_ready_cmyk: already-CMYK fast path copy failed (%s) — falling through to GS",
                    exc,
                )

        intent_value = resolve_intent(intent)

        icc_dir = str(ICC_DIR)
        src_dir = str(src.parent)
        out_dir = str(out_pdf.parent)

        common_safer = [
            "-dSAFER",
            f"--permit-file-read={icc_dir}",
            f"--permit-file-read={src_dir}",
            f"--permit-file-write={out_dir}",
        ]

        attempts: list[tuple[str, list[str]]] = []

        # Resolve ICC profiles for attempts 1 & 2.  If the sRGB source
        # profile or the destination CMYK profile is missing on disk we
        # log a warning and skip straight to the built-in fallback
        # (attempt 3) which needs no external ICC files at all.
        try:
            dest_path = resolve_profile(dest_profile)
            rgb_path = resolve_profile("srgb")
            icc_available = True
        except (FileNotFoundError, ValueError) as icc_err:
            logger.warning(
                "to_print_ready_cmyk: ICC profiles unavailable (%s) — "
                "skipping ICC attempts, falling through to built-in CMYK",
                icc_err,
            )
            icc_available = False

        if icc_available:
            # Attempt 1: full ICC conversion with K-preserve / overprint flags.
            rich_cmd = [
                settings.ghostscript_bin,
                *common_safer,
                "-dBATCH",
                "-dNOPAUSE",
                "-dAutoRotatePages=/None",
                "-dNumRenderingThreads=4",
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.7",
                "-sColorConversionStrategy=CMYK",
                "-dProcessColorModel=/DeviceCMYK",
                "-dOverrideICC=true",
                f"-sDefaultRGBProfile={rgb_path}",
                f"-sDefaultCMYKProfile={dest_path}",
                f"-dRenderIntent={intent_value}",
                "-dBlackPtComp=true",
                "-dPreserveOverprintSettings=true",
            ]
            if preserve_black:
                rich_cmd.append("-dKPreserve=2")
            rich_cmd.extend(["-o", str(out_pdf), str(src)])
            attempts.append(("rich_icc", rich_cmd))

            # Attempt 2: core ICC conversion only (drop the flags most often
            # rejected by older GS builds with exit 255 / empty stderr).
            core_cmd = [
                settings.ghostscript_bin,
                *common_safer,
                "-dBATCH",
                "-dNOPAUSE",
                "-dAutoRotatePages=/None",
                "-dNumRenderingThreads=4",
                "-sDEVICE=pdfwrite",
                "-sColorConversionStrategy=CMYK",
                "-dProcessColorModel=/DeviceCMYK",
                "-dOverrideICC=true",
                f"-sDefaultRGBProfile={rgb_path}",
                f"-sDefaultCMYKProfile={dest_path}",
                "-o", str(out_pdf), str(src),
            ]
            attempts.append(("core_icc", core_cmd))

        # Attempt 3: CMYK conversion using GS built-in defaults (no
        # external profiles). Some GS packages can't load arbitrary ICCs.
        builtin_cmd = [
            settings.ghostscript_bin,
            "-dSAFER", "-dBATCH", "-dNOPAUSE",
            "-dAutoRotatePages=/None",
            "-dNumRenderingThreads=4",
            "-sDEVICE=pdfwrite",
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            "-o", str(out_pdf), str(src),
        ]
        attempts.append(("builtin_cmyk", builtin_cmd))

        # Attempt 4: plain pdfwrite passthrough (last-resort, NOT real CMYK).
        passthrough_cmd = [
            settings.ghostscript_bin,
            "-dSAFER", "-dBATCH", "-dNOPAUSE",
            "-dAutoRotatePages=/None",
            "-sDEVICE=pdfwrite",
            "-o", str(out_pdf), str(src),
        ]
        attempts.append(("passthrough", passthrough_cmd))

        diagnostics: list[dict] = []
        chosen: tuple[str, subprocess.CompletedProcess] | None = None
        for name, cmd in attempts:
            # Fresh output file each attempt.
            try:
                if out_pdf.exists():
                    out_pdf.unlink()
            except Exception:
                pass
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            except subprocess.TimeoutExpired as exc:
                diagnostics.append({
                    "attempt": name, "rc": "timeout",
                    "stderr_tail": (exc.stderr or b"").decode(errors="replace")[-2000:] if exc.stderr else "",
                    "stdout_tail": (exc.stdout or b"").decode(errors="replace")[-2000:] if exc.stdout else "",
                })
                continue
            ok = proc.returncode == 0 and out_pdf.exists() and out_pdf.stat().st_size > 0
            diagnostics.append({
                "attempt": name,
                "rc": proc.returncode,
                "out_exists": out_pdf.exists(),
                "out_size": out_pdf.stat().st_size if out_pdf.exists() else 0,
                "stderr_tail": (proc.stderr or "")[-2000:],
                "stdout_tail": (proc.stdout or "")[-2000:],
            })
            if ok:
                chosen = (name, proc)
                break
            logger.warning(
                "to_print_ready_cmyk: attempt %s failed rc=%s stderr=%r stdout=%r",
                name, proc.returncode,
                (proc.stderr or "")[-500:], (proc.stdout or "")[-500:],
            )

        if chosen is None:
            raise RuntimeError(
                "Ghostscript print-ready conversion failed after all fallbacks. "
                f"Diagnostics: {diagnostics}"
            )

        name, proc = chosen
        is_real_cmyk = name in ("rich_icc", "core_icc", "builtin_cmyk")
        timings["ghostscript_total"] = int((time.monotonic() - t0) * 1000)
        return {
            "dest_profile": dest_profile,
            "intent": intent,
            "preserve_black": preserve_black,
            "before_size": src.stat().st_size,
            "after_size": out_pdf.stat().st_size,
            "attempt": name,
            "icc_converted": is_real_cmyk,
            "fallback_used": name != "rich_icc",
            "diagnostics": diagnostics,
            "timings_ms": timings,
        }


pdf_ops = PdfOps()
