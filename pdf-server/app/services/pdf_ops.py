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

    def pad_pages(self, src: Path, out_pdf: Path, multiple: int = 4) -> dict:
        """Pad a PDF with blank pages so total page count is divisible by `multiple`.

        Used for saddle-stitched booklets where each folded sheet has 4 faces.
        Returns stats including original and final page counts.
        """
        reader = PdfReader(str(src))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        original_count = len(reader.pages)
        remainder = original_count % multiple
        added = 0
        if remainder != 0:
            blanks_needed = multiple - remainder
            # Use page 1 dimensions for blank pages
            first_page = reader.pages[0]
            w = float(first_page.mediabox.width)
            h = float(first_page.mediabox.height)
            for _ in range(blanks_needed):
                writer.add_blank_page(width=w, height=h)
                added += 1

        with open(out_pdf, "wb") as f:
            writer.write(f)

        return {
            "original_page_count": original_count,
            "final_page_count": original_count + added,
            "pages_added": added,
            "multiple": multiple,
        }

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
        """
        Strategy ladder for pure-K text greyscale conversion.

        Order:
          1. mutool convert -O colorspace=gray   (MuPDF colour engine,
             no ICC tone-curve round-trip — RGB(0,0,0) → DeviceGray 0).
          2. Ghostscript two-pass CMYK→Gray with -dBlackText/-dKPreserve=2.
          3. Ghostscript single-pass Gray (legacy last resort).

        Each candidate is verified with ``verify_pure_black_text``; if
        ``pure_k_ok`` (min K ≥ 95%, max C+M+Y ≤ 5%) we accept and stop.
        Otherwise we escalate. The winning strategy + metrics are stashed
        on the instance as ``self.last_grayscale_report`` so the caller
        (production task) can attach them to ``assembly_report.colour_check``.
        """
        candidates: list[tuple[str, Path]] = []
        attempts: list[dict] = []

        for strategy_name, runner in (
            ("mutool", self._grayscale_via_mutool),
            ("gs_two_pass", self._grayscale_via_gs_two_pass),
            ("gs_single_pass", self._grayscale_via_gs_single_pass),
        ):
            candidate = out_pdf.with_suffix(f".candidate.{strategy_name}.pdf")
            try:
                ok = runner(src, candidate)
            except Exception as exc:
                logger.warning("grayscale[%s] raised: %s", strategy_name, exc)
                attempts.append({"strategy": strategy_name, "ok": False, "error": str(exc)})
                continue
            if not ok or not candidate.exists() or candidate.stat().st_size == 0:
                attempts.append({"strategy": strategy_name, "ok": False, "error": "no_output"})
                continue

            metrics = self.verify_pure_black_text(candidate)
            attempts.append({"strategy": strategy_name, "metrics": metrics})
            candidates.append((strategy_name, candidate))

            if metrics.get("pure_k_ok"):
                logger.info("grayscale[%s]: pure-K verified (%s)", strategy_name, metrics)
                candidate.replace(out_pdf)
                self._cleanup_candidates(candidates, keep=out_pdf)
                self.last_grayscale_report = {
                    "strategy": strategy_name,
                    "metrics": metrics,
                    "attempts": attempts,
                }
                return out_pdf

            logger.warning(
                "grayscale[%s]: failed verifier — min_k=%s max_cmy=%s",
                strategy_name, metrics.get("min_k_pct"), metrics.get("max_cmy_pct"),
            )

        # No strategy passed verifier — keep best (last) candidate so the
        # operator at least gets a file, and surface the failure in report.
        if candidates:
            best_name, best_path = candidates[-1]
            best_path.replace(out_pdf)
            self._cleanup_candidates(candidates, keep=out_pdf)
            self.last_grayscale_report = {
                "strategy": f"{best_name} (verifier_failed)",
                "metrics": next(
                    (a["metrics"] for a in reversed(attempts) if "metrics" in a),
                    {"checked": False},
                ),
                "attempts": attempts,
            }
            logger.error("grayscale: no strategy passed verifier; kept %s", best_name)
            return out_pdf

        raise RuntimeError(f"grayscale: all strategies failed: {attempts}")

    def _cleanup_candidates(self, candidates: list[tuple[str, Path]], keep: Path) -> None:
        for _, p in candidates:
            try:
                if p.exists() and p.resolve() != keep.resolve():
                    p.unlink()
            except Exception:
                pass

    def _grayscale_via_mutool(self, src: Path, out_pdf: Path) -> bool:
        """Primary: MuPDF's colour engine — literal DeviceGray, no tone curve."""
        import shutil as _shutil
        mutool = _shutil.which(settings.mutool_bin)
        if not mutool:
            logger.info("grayscale[mutool]: binary not found, skipping")
            return False
        cmd = [
            mutool, "convert",
            "-F", "pdf",
            "-O", "colorspace=gray,compression=flate,garbage=compact",
            "-o", str(out_pdf), str(src),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            logger.warning("grayscale[mutool] rc=%s stderr=%r", proc.returncode, (proc.stderr or "")[-300:])
            return False
        # Normalise / garbage-collect for a tidy output.
        try:
            cleaned = out_pdf.with_suffix(".cleaned.pdf")
            clean_proc = subprocess.run(
                [mutool, "clean", "-ggg", str(out_pdf), str(cleaned)],
                capture_output=True, text=True,
            )
            if clean_proc.returncode == 0 and cleaned.exists() and cleaned.stat().st_size > 0:
                cleaned.replace(out_pdf)
            else:
                cleaned.unlink(missing_ok=True)
        except Exception:
            pass
        return out_pdf.exists() and out_pdf.stat().st_size > 0

    def _grayscale_via_gs_two_pass(self, src: Path, out_pdf: Path) -> bool:
        """Ghostscript: RGB→CMYK (K-only forced) → DeviceGray."""
        from app.services.icc_profiles import resolve_profile

        icc_dir = str(ICC_DIR)
        src_dir = str(src.parent)
        out_dir = str(out_pdf.parent)

        profile_flags: list[str] = []
        try:
            profile_flags.append(f"-sDefaultRGBProfile={resolve_profile('srgb')}")
        except (FileNotFoundError, ValueError):
            pass
        try:
            profile_flags.append(f"-sDefaultCMYKProfile={resolve_profile('fogra39')}")
        except (FileNotFoundError, ValueError):
            pass
        if profile_flags:
            profile_flags.append("-dOverrideICC=true")

        common = [
            settings.ghostscript_bin,
            "-dSAFER",
            f"--permit-file-read={icc_dir}",
            f"--permit-file-read={src_dir}",
            f"--permit-file-write={out_dir}",
            "-dBATCH", "-dNOPAUSE",
            "-dAutoRotatePages=/None",
            "-dNumRenderingThreads=4",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.7",
        ]

        stage_a = out_pdf.with_suffix(".stageA.pdf")
        stage_a_cmd = [
            *common,
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            *profile_flags,
            "-dRenderIntent=1",
            "-dBlackPtComp=true",
            "-dKPreserve=2",
            "-dBlackText=true",
            "-dBlackVector=true",
            "-dPreserveOverprintSettings=true",
            "-dHaveTransparency=true",
            "-o", str(stage_a), str(src),
        ]
        proc_a = subprocess.run(stage_a_cmd, capture_output=True, text=True)
        if proc_a.returncode != 0 or not stage_a.exists() or stage_a.stat().st_size == 0:
            logger.warning("grayscale[gs_two_pass] stage A rc=%s stderr=%r",
                           proc_a.returncode, (proc_a.stderr or "")[-300:])
            return False

        stage_b_cmd = [
            *common,
            "-sColorConversionStrategy=Gray",
            "-dProcessColorModel=/DeviceGray",
            *profile_flags,
            "-dRenderIntent=1",
            "-dBlackPtComp=true",
            "-dAutoFilterGrayImages=false",
            "-dGrayImageFilter=/FlateEncode",
            "-dDownsampleGrayImages=false",
            "-o", str(out_pdf), str(stage_a),
        ]
        proc_b = subprocess.run(stage_b_cmd, capture_output=True, text=True)
        try:
            stage_a.unlink()
        except Exception:
            pass
        if proc_b.returncode != 0 or not out_pdf.exists() or out_pdf.stat().st_size == 0:
            logger.warning("grayscale[gs_two_pass] stage B rc=%s stderr=%r",
                           proc_b.returncode, (proc_b.stderr or "")[-300:])
            return False
        return True

    def _grayscale_via_gs_single_pass(self, src: Path, out_pdf: Path) -> bool:
        """Legacy single-pass Ghostscript Gray (last-resort fallback)."""
        cmd = [
            settings.ghostscript_bin,
            "-dSAFER", "-dBATCH", "-dNOPAUSE",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.7",
            "-sColorConversionStrategy=Gray",
            "-dProcessColorModel=/DeviceGray",
            "-o", str(out_pdf), str(src),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            logger.warning("grayscale[gs_single_pass] rc=%s stderr=%r",
                           proc.returncode, (proc.stderr or "")[-300:])
            return False
        return out_pdf.exists() and out_pdf.stat().st_size > 0



    def verify_pure_black_text(self, src: Path) -> dict:
        """
        Rasterise page 1 to a CMYK TIFF and report the K/CMY distribution of
        near-black pixels. Result lands in ``assembly_report.colour_check``
        so the operator has proof that text is true K-only.

        Returns a dict like:
            {
              "checked": True,
              "near_black_pixels": 12345,
              "min_k_pct": 100.0,        # smallest K among near-black px
              "max_cmy_pct": 0.0,        # largest C+M+Y sum among same
              "pure_k_ok": True,         # min_k >= 95 and max_cmy <= 5
            }

        Failures (missing PIL, GS error, no page) are non-fatal — we just
        return ``{"checked": False, "reason": "..."}``.
        """
        try:
            import tempfile
            from PIL import Image  # type: ignore
        except Exception as exc:
            return {"checked": False, "reason": f"pillow_unavailable: {exc}"}

        if not src.exists() or src.stat().st_size == 0:
            return {"checked": False, "reason": "missing_input"}

        with tempfile.TemporaryDirectory() as td:
            out_tiff = Path(td) / "page1.tif"
            cmd = [
                settings.ghostscript_bin,
                "-dSAFER",
                f"--permit-file-read={src.parent}",
                f"--permit-file-write={td}",
                "-dBATCH", "-dNOPAUSE",
                "-sDEVICE=tiff32nc",     # 32-bit CMYK
                "-r150",
                "-dFirstPage=1", "-dLastPage=1",
                "-o", str(out_tiff), str(src),
            ]
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True)
            except Exception as exc:
                return {"checked": False, "reason": f"gs_raised: {exc}"}
            if proc.returncode != 0 or not out_tiff.exists():
                return {
                    "checked": False,
                    "reason": f"gs_rc={proc.returncode}",
                    "stderr": (proc.stderr or "")[-200:],
                }

            try:
                im = Image.open(out_tiff)
                if im.mode != "CMYK":
                    im = im.convert("CMYK")
                # Downsample to keep this fast on multi-MP rasters.
                w, h = im.size
                scale = max(1, max(w, h) // 800)
                if scale > 1:
                    im = im.resize((w // scale, h // scale), Image.NEAREST)
                px = im.load()
                W, H = im.size
                near_black = 0
                min_k = 256
                max_cmy = 0
                for y in range(H):
                    for x in range(W):
                        c, m, yv, k = px[x, y]
                        cmy = c + m + yv
                        # Near-black classification: high K and low CMY,
                        # OR very dark composite (k+cmy/3 > 200).
                        if k >= 200 or (k + cmy // 3) >= 220:
                            near_black += 1
                            if k < min_k:
                                min_k = k
                            if cmy > max_cmy:
                                max_cmy = cmy
                if near_black == 0:
                    return {"checked": True, "near_black_pixels": 0, "reason": "no_near_black_text"}
                min_k_pct = round((min_k / 255.0) * 100.0, 2)
                max_cmy_pct = round((max_cmy / (3 * 255.0)) * 100.0, 2)
                return {
                    "checked": True,
                    "near_black_pixels": near_black,
                    "min_k_pct": min_k_pct,
                    "max_cmy_pct": max_cmy_pct,
                    "pure_k_ok": (min_k_pct >= 95.0 and max_cmy_pct <= 5.0),
                }
            except Exception as exc:
                return {"checked": False, "reason": f"pillow_raised: {exc}"}


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

    # ------------------------------------------------------------------ #
    # Template-driven imposition (platform-managed press-sheet templates)
    # ------------------------------------------------------------------ #
    def impose_with_template(
        self,
        source_pdf: Path,
        template_pdf: Path,
        slots,
        n_up: int,
        out_pdf: Path,
    ) -> int:
        """Stamp customer pages onto a press-sheet template.

        For every chunk of `n_up` customer pages we clone the first page of
        `template_pdf` and overlay each customer page into its slot rectangle
        (from the bottom-left of the press sheet, mm). The template PDF is the
        source of truth for crop marks, colour bars and registration marks —
        no procedural marks are added here.

        Returns the number of composite sheets produced.
        """
        from math import cos, radians, sin
        MM_TO_PT = 2.83464567

        if n_up < 1:
            raise ValueError("n_up must be >= 1")
        if not slots or len(slots) != n_up:
            raise ValueError(f"slots must contain exactly n_up ({n_up}) entries")

        out_pdf.parent.mkdir(parents=True, exist_ok=True)

        with pikepdf.open(str(source_pdf)) as src_pdf, \
             pikepdf.open(str(template_pdf)) as tpl_pdf:

            if len(tpl_pdf.pages) < 1:
                raise ValueError("Template PDF has no pages")
            template_page = tpl_pdf.pages[0]

            customer_pages = list(src_pdf.pages)
            if not customer_pages:
                raise ValueError("Source PDF has no pages")

            output = pikepdf.Pdf.new()
            sheets = 0

            for chunk_start in range(0, len(customer_pages), n_up):
                # Clone template page into the output
                output.pages.append(template_page)
                sheet = output.pages[-1]

                for slot_idx in range(n_up):
                    src_idx = chunk_start + slot_idx
                    if src_idx >= len(customer_pages):
                        break  # partial chunk — leave remaining slots blank
                    slot = slots[slot_idx]
                    cust_page = customer_pages[src_idx]

                    # Slot rectangle in PDF points (origin bottom-left of sheet)
                    x0 = slot.x_mm * MM_TO_PT
                    y0 = slot.y_mm * MM_TO_PT
                    x1 = (slot.x_mm + slot.width_mm) * MM_TO_PT
                    y1 = (slot.y_mm + slot.height_mm) * MM_TO_PT
                    rect = pikepdf.Rectangle(x0, y0, x1, y1)

                    rotation = float(slot.rotation_deg or 0) % 360
                    if rotation == 0:
                        sheet.add_overlay(cust_page, rect)
                    else:
                        # add_overlay scales to rect first; we then need to rotate
                        # around the slot centre. pikepdf 9 supports `transform=`.
                        cx = (x0 + x1) / 2
                        cy = (y0 + y1) / 2
                        theta = radians(rotation)
                        c, s = cos(theta), sin(theta)
                        # 2D affine: translate centre→origin, rotate, translate back
                        tx = cx - (cx * c - cy * s)
                        ty = cy - (cx * s + cy * c)
                        rotate = pikepdf.Matrix(c, s, -s, c, tx, ty)
                        try:
                            sheet.add_overlay(cust_page, rect, transform=rotate)
                        except TypeError:
                            # Older pikepdf without `transform=` kw — fall back
                            # to unrotated overlay (the platform admin should
                            # avoid rotated slots in that case).
                            sheet.add_overlay(cust_page, rect)

                sheets += 1

            output.save(str(out_pdf))
            return sheets

    # ------------------------------------------------------------------ #
    # TrimBox-aware n-up imposition (industry-standard, replaces the old
    # MediaBox-only impose_sheet_with_bleed for new callers)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _resolve_trim_box(page, fallback_inset_pt: float = 0.0) -> list[float]:
        """Return [x0,y0,x1,y1] of the page's TrimBox, with the standard
        printing-industry fallback ladder: TrimBox → BleedBox shrunk by
        fallback_inset → MediaBox shrunk by fallback_inset.

        `fallback_inset_pt` is the assumed bleed (in PDF points) when the
        producer didn't declare a TrimBox. 0 means "treat the whole box as
        trim" (no inset).
        """
        for attr in ("TrimBox", "BleedBox", "MediaBox"):
            b = page.get(f"/{attr}", None)
            if b is None and attr == "MediaBox":
                b = page.MediaBox
            if b is None:
                continue
            try:
                box = [float(b[0]), float(b[1]), float(b[2]), float(b[3])]
            except Exception:
                continue
            if attr == "TrimBox":
                return box
            if fallback_inset_pt > 0:
                return [
                    box[0] + fallback_inset_pt,
                    box[1] + fallback_inset_pt,
                    box[2] - fallback_inset_pt,
                    box[3] - fallback_inset_pt,
                ]
            return box
        raise ValueError("Page has no TrimBox/BleedBox/MediaBox")

    def impose_nup_trimbox(
        self,
        src: Path,
        out_pdf: Path,
        *,
        columns: int,
        rows: int,
        sheet_width_mm: float,
        sheet_height_mm: float,
        bleed_mm: float = 3.0,
        gutter_mm: float = 0.0,
        crop_mark_offset_mm: float = 3.0,
        crop_mark_length_mm: float = 5.0,
        show_registration: bool = True,
        fallback_trim_inset_mm: float = 0.0,
    ) -> dict:
        """Industry-standard n-up imposition that honours each source
        page's TrimBox.

        Layout:
          - Trim sizes are read from the source pages' TrimBox (with the
            standard fallback ladder). The first page's trim defines the
            slot pitch — mixed-trim documents get clipped to slot 1.
          - `gutter_mm = 0` → "gang up" mode: trim edges of adjacent slots
            butt against each other. Bleed from one slot extends visually
            into its neighbour but the cut line is shared.
          - `gutter_mm > 0` → real gap between trim edges (typical when the
            press needs cutter relief or each slot needs its own bleed).
          - Crop marks are drawn at every slot's TrimBox corners, with a
            configurable offset gap and length.
          - Registration crosshairs are placed in the four sheet-margin
            corners when `show_registration` is true.

        Output:
          - MediaBox = full press sheet.
          - TrimBox  = bounding rect of the live block (slot grid).
          - BleedBox = TrimBox grown by `bleed_mm`, clamped to MediaBox.

        Returns a stats dict (sheet_count, n_up, slot_size, etc).
        """
        from io import BytesIO

        if columns < 1 or rows < 1:
            raise ValueError("columns and rows must be >= 1")

        MM = 2.83464567  # PDF points per millimetre
        sheet_w = sheet_width_mm * MM
        sheet_h = sheet_height_mm * MM
        bleed = bleed_mm * MM
        gutter = gutter_mm * MM
        cm_off = crop_mark_offset_mm * MM
        cm_len = crop_mark_length_mm * MM
        fallback_inset = fallback_trim_inset_mm * MM

        out_pdf.parent.mkdir(parents=True, exist_ok=True)

        with pikepdf.open(str(src)) as src_pdf:
            customer_pages = list(src_pdf.pages)
            if not customer_pages:
                raise ValueError("Source PDF has no pages")

            trim0 = self._resolve_trim_box(customer_pages[0], fallback_inset)
            trim_w = trim0[2] - trim0[0]
            trim_h = trim0[3] - trim0[1]
            if trim_w <= 0 or trim_h <= 0:
                raise ValueError("First page has invalid TrimBox dimensions")

            slot_pitch_w = trim_w + gutter
            slot_pitch_h = trim_h + gutter
            block_w = columns * trim_w + max(0, columns - 1) * gutter
            block_h = rows * trim_h + max(0, rows - 1) * gutter

            if block_w + 2 * bleed > sheet_w or block_h + 2 * bleed > sheet_h:
                raise ValueError(
                    f"Imposed block ({block_w/MM:.1f}×{block_h/MM:.1f}mm + bleed) "
                    f"does not fit on press sheet ({sheet_width_mm}×{sheet_height_mm}mm)."
                )

            origin_x = (sheet_w - block_w) / 2
            origin_y = (sheet_h - block_h) / 2

            per_sheet = columns * rows
            output = pikepdf.Pdf.new()
            sheet_count = 0

            for chunk_start in range(0, len(customer_pages), per_sheet):
                output.add_blank_page(page_size=(sheet_w, sheet_h))
                sheet = output.pages[-1]

                slot_rects: list[tuple[float, float, float, float]] = []
                for i in range(per_sheet):
                    col = i % columns
                    row = i // columns
                    tx0 = origin_x + col * slot_pitch_w
                    # Row 0 at top
                    ty0 = origin_y + (rows - 1 - row) * slot_pitch_h
                    slot_rects.append((tx0, ty0, tx0 + trim_w, ty0 + trim_h))

                for slot_idx in range(per_sheet):
                    src_idx = chunk_start + slot_idx
                    if src_idx >= len(customer_pages):
                        break
                    cust = customer_pages[src_idx]
                    trim = self._resolve_trim_box(cust, fallback_inset)

                    # The "bleed rectangle" we want to land into the slot-
                    # plus-bleed area on the press sheet. Clamp to the
                    # source MediaBox so we don't reference content the
                    # producer never drew.
                    mb = cust.MediaBox
                    mb_box = [float(mb[0]), float(mb[1]), float(mb[2]), float(mb[3])]
                    cust_bleed = [
                        max(mb_box[0], trim[0] - bleed),
                        max(mb_box[1], trim[1] - bleed),
                        min(mb_box[2], trim[2] + bleed),
                        min(mb_box[3], trim[3] + bleed),
                    ]

                    tx0, ty0, tx1, ty1 = slot_rects[slot_idx]
                    tgt_rect = pikepdf.Rectangle(
                        tx0 - bleed, ty0 - bleed,
                        tx1 + bleed, ty1 + bleed,
                    )

                    # Temporarily set MediaBox = the source bleed rectangle
                    # so add_overlay maps that exact area into our slot.
                    original_mb = list(mb_box)
                    cust.MediaBox = pikepdf.Array(cust_bleed)
                    try:
                        sheet.add_overlay(cust, tgt_rect)
                    finally:
                        cust.MediaBox = pikepdf.Array(original_mb)

                # Crop marks + registration overlay (reportlab → pikepdf)
                ov_buf = BytesIO()
                c = canvas.Canvas(ov_buf, pagesize=(sheet_w, sheet_h))
                c.setLineWidth(0.25)
                c.setStrokeColor(Color(0, 0, 0, alpha=1))
                for slot_idx in range(per_sheet):
                    src_idx = chunk_start + slot_idx
                    if src_idx >= len(customer_pages):
                        break
                    tx0, ty0, tx1, ty1 = slot_rects[slot_idx]
                    # Marks are drawn AT the trim corners with a `cm_off`
                    # gap, extending OUTWARD into the bleed/waste area.
                    # bottom-left
                    c.line(tx0 - cm_off - cm_len, ty0, tx0 - cm_off, ty0)
                    c.line(tx0, ty0 - cm_off - cm_len, tx0, ty0 - cm_off)
                    # bottom-right
                    c.line(tx1 + cm_off, ty0, tx1 + cm_off + cm_len, ty0)
                    c.line(tx1, ty0 - cm_off - cm_len, tx1, ty0 - cm_off)
                    # top-left
                    c.line(tx0 - cm_off - cm_len, ty1, tx0 - cm_off, ty1)
                    c.line(tx0, ty1 + cm_off, tx0, ty1 + cm_off + cm_len)
                    # top-right
                    c.line(tx1 + cm_off, ty1, tx1 + cm_off + cm_len, ty1)
                    c.line(tx1, ty1 + cm_off, tx1, ty1 + cm_off + cm_len)

                if show_registration:
                    r = 3 * MM
                    margin_x = max(8 * MM, (sheet_w - block_w) / 4)
                    margin_y = max(8 * MM, (sheet_h - block_h) / 4)
                    for cx, cy in [
                        (margin_x, margin_y),
                        (sheet_w - margin_x, margin_y),
                        (margin_x, sheet_h - margin_y),
                        (sheet_w - margin_x, sheet_h - margin_y),
                    ]:
                        c.circle(cx, cy, r, stroke=1, fill=0)
                        c.line(cx - r - 1 * MM, cy, cx + r + 1 * MM, cy)
                        c.line(cx, cy - r - 1 * MM, cx, cy + r + 1 * MM)

                c.showPage()
                c.save()
                ov_buf.seek(0)
                with pikepdf.open(ov_buf) as ov_pdf:
                    sheet.add_overlay(
                        ov_pdf.pages[0],
                        pikepdf.Rectangle(0, 0, sheet_w, sheet_h),
                    )

                # Stamp output boxes so downstream tools know live area.
                sheet.TrimBox = pikepdf.Array([
                    origin_x, origin_y,
                    origin_x + block_w, origin_y + block_h,
                ])
                sheet.BleedBox = pikepdf.Array([
                    max(0, origin_x - bleed),
                    max(0, origin_y - bleed),
                    min(sheet_w, origin_x + block_w + bleed),
                    min(sheet_h, origin_y + block_h + bleed),
                ])

                sheet_count += 1

            output.save(str(out_pdf))

        return {
            "sheet_count": sheet_count,
            "n_up": per_sheet,
            "columns": columns,
            "rows": rows,
            "slot_size_mm": [trim_w / MM, trim_h / MM],
            "bleed_mm": bleed_mm,
            "gutter_mm": gutter_mm,
            "press_sheet_mm": [sheet_width_mm, sheet_height_mm],
        }

    # ------------------------------------------------------------------ #
    # Saddle-stitch booklet imposition (with creep compensation)
    # ------------------------------------------------------------------ #
    def booklet_saddle_stitch(
        self,
        src: Path,
        out_pdf: Path,
        *,
        sheet_width_mm: float,
        sheet_height_mm: float,
        bleed_mm: float = 3.0,
        creep_per_sheet_mm: float = 0.0,
        crop_marks: bool = True,
        fold_mark: bool = True,
        fallback_trim_inset_mm: float = 0.0,
    ) -> dict:
        """Saddle-stitch booklet imposition.

        Pads source to a multiple of 4 with blank pages, then lays out
        2-up reader spreads on each side of every printed sheet using the
        standard signature ordering:

            sheet 1 front:  [N,    1]
            sheet 1 back:   [2,    N-1]
            sheet 2 front:  [N-2,  3]
            sheet 2 back:   [4,    N-3]
            …

        Creep compensation: each printed sheet shifts content TOWARD the
        spine by `creep_per_sheet_mm × sheet_index`. The outermost sheet
        (s=0) gets zero shift; the innermost gets the largest.

        Source page TrimBox (with fallback) is the unit that gets fitted
        into each half-sheet — anything outside trim is treated as bleed
        and clipped at the half-sheet boundary.
        """
        from io import BytesIO

        MM = 2.83464567
        sheet_w = sheet_width_mm * MM
        sheet_h = sheet_height_mm * MM
        half_w = sheet_w / 2
        creep = creep_per_sheet_mm * MM
        fallback_inset = fallback_trim_inset_mm * MM

        out_pdf.parent.mkdir(parents=True, exist_ok=True)

        with pikepdf.open(str(src)) as src_pdf:
            real_pages = list(src_pdf.pages)
            original_n = len(real_pages)
            if original_n == 0:
                raise ValueError("Source PDF has no pages")

            # Pad by repeating None markers (handled as blanks below).
            padded: list = list(real_pages)
            while len(padded) % 4 != 0:
                padded.append(None)
            n = len(padded)
            sheet_count = n // 4

            output = pikepdf.Pdf.new()

            def _place(sheet_page, page, side: str, sheet_index: int) -> None:
                if page is None:
                    return
                trim = self._resolve_trim_box(page, fallback_inset)
                tw = trim[2] - trim[0]
                th = trim[3] - trim[1]
                if tw <= 0 or th <= 0:
                    return
                scale = min(half_w / tw, sheet_h / th)
                draw_w = tw * scale
                draw_h = th * scale
                y = (sheet_h - draw_h) / 2
                creep_shift = creep * sheet_index

                if side == "left":
                    x = (half_w - draw_w) / 2 + creep_shift
                else:
                    x = half_w + (half_w - draw_w) / 2 - creep_shift

                tgt = pikepdf.Rectangle(x, y, x + draw_w, y + draw_h)

                original_mb = list(map(float, page.MediaBox))
                page.MediaBox = pikepdf.Array(trim)
                try:
                    sheet_page.add_overlay(page, tgt)
                finally:
                    page.MediaBox = pikepdf.Array(original_mb)

            for s in range(sheet_count):
                output.add_blank_page(page_size=(sheet_w, sheet_h))
                front = output.pages[-1]
                output.add_blank_page(page_size=(sheet_w, sheet_h))
                back = output.pages[-1]

                # Standard saddle-stitch signature for sheet s (0-indexed):
                _place(front, padded[n - 1 - 2 * s], "left",  s)
                _place(front, padded[2 * s],         "right", s)
                _place(back,  padded[2 * s + 1],     "left",  s)
                _place(back,  padded[n - 2 - 2 * s], "right", s)

                if crop_marks or fold_mark:
                    ov = BytesIO()
                    c = canvas.Canvas(ov, pagesize=(sheet_w, sheet_h))
                    c.setLineWidth(0.25)
                    c.setStrokeColor(Color(0, 0, 0, alpha=1))
                    cm_len = 5 * MM
                    cm_off = 3 * MM
                    if crop_marks:
                        for (cx, cy) in [
                            (0, 0), (sheet_w, 0),
                            (0, sheet_h), (sheet_w, sheet_h),
                        ]:
                            sx = -1 if cx == 0 else 1
                            sy = -1 if cy == 0 else 1
                            c.line(cx + sx * cm_off, cy,
                                   cx + sx * (cm_off + cm_len), cy)
                            c.line(cx, cy + sy * cm_off,
                                   cx, cy + sy * (cm_off + cm_len))
                    if fold_mark:
                        c.setDash(2, 2)
                        c.line(half_w, cm_off, half_w, cm_off + cm_len)
                        c.line(half_w, sheet_h - cm_off - cm_len,
                               half_w, sheet_h - cm_off)
                        c.setDash()
                    c.showPage()
                    c.save()
                    ov.seek(0)
                    with pikepdf.open(ov) as ov_pdf:
                        front.add_overlay(
                            ov_pdf.pages[0],
                            pikepdf.Rectangle(0, 0, sheet_w, sheet_h),
                        )
                        back.add_overlay(
                            ov_pdf.pages[0],
                            pikepdf.Rectangle(0, 0, sheet_w, sheet_h),
                        )

            output.save(str(out_pdf))

        return {
            "sheet_count": sheet_count,
            "original_page_count": original_n,
            "padded_page_count": n,
            "creep_per_sheet_mm": creep_per_sheet_mm,
            "press_sheet_mm": [sheet_width_mm, sheet_height_mm],
        }

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
                # Always preserve K so RGB(0,0,0) text and CMYK rich-black
                # text both collapse to pure 0/0/0/100. Without these the
                # converter happily emits 4-colour rich black for body copy.
                "-dKPreserve=2",
                "-dBlackText=true",
                "-dBlackVector=true",
                "-dPreserveOverprintSettings=true",
                "-dOverprint=/simulate",
                "-dHaveTransparency=true",
            ]
            # Legacy switch kept for callers that explicitly opt out — but
            # the default is now "always preserve" because no print shop
            # wants rich-black body text.
            if not preserve_black:
                # Drop the K-preserve trio so the call site can request a
                # colorimetric-only conversion if they really need it.
                rich_cmd = [f for f in rich_cmd if f not in (
                    "-dKPreserve=2", "-dBlackText=true", "-dBlackVector=true"
                )]
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


    def prepare_for_product(
        self,
        src: Path,
        out_pdf: Path,
        *,
        dominant_orientation: str | None = None,
        target_width_mm: float | None = None,
        target_height_mm: float | None = None,
        fit_mode: str = "fit",
        dest_profile: str | None = None,
        intent: str = "relative_colorimetric",
        preserve_black: bool = True,
    ) -> dict:
        """One-shot PDF preparation: CMYK → orient → resize.

        This is the ONLY function the frontend needs to call. It performs
        every mutation in a deterministic order inside one workspace:

          1. Print-ready CMYK conversion (Ghostscript) — optional, only when
             ``dest_profile`` is supplied. After this step Ghostscript has
             finished rewriting the PDF and will never touch it again.
          2. Orientation normalisation — bake /Rotate hints, physically
             rotate pages whose visual orientation doesn't match
             ``dominant_orientation``. Works on the post-CMYK PDF so GS
             can't undo it.
          3. Resize to target canvas — scale (and atomically re-rotate any
             remaining outliers) onto the target paper size. Works on the
             already-oriented PDF so the content is correct before scaling.

        Each step feeds its output into the next step's input. Only the
        final result is written to ``out_pdf``.

        Returns a stats dict with keys from each step that was executed.
        """
        import shutil

        stats: dict = {"steps": []}
        current = src

        # ── Step 1: CMYK ─────────────────────────────────────────────
        if dest_profile:
            cmyk_out = out_pdf.parent / "prepare_cmyk.pdf"
            try:
                cmyk_stats = self.to_print_ready_cmyk(
                    current, cmyk_out,
                    dest_profile=dest_profile,
                    intent=intent,
                    preserve_black=preserve_black,
                )
                stats["cmyk"] = cmyk_stats
                stats["steps"].append("cmyk")
                current = cmyk_out
            except Exception as exc:
                # CMYK is non-fatal — continue with the un-converted PDF.
                stats["cmyk_error"] = str(exc)
                logger.warning("prepare_for_product: CMYK failed (non-fatal): %s", exc)

        # ── Step 2: Orientation ──────────────────────────────────────
        if dominant_orientation in ("portrait", "landscape"):
            orient_out = out_pdf.parent / "prepare_oriented.pdf"
            orient_stats = self.normalize_orientation(
                current, orient_out, dominant=dominant_orientation,
            )
            stats["orientation"] = orient_stats
            stats["steps"].append("orientation")
            if not orient_stats.get("skipped"):
                current = orient_out

        # ── Step 3: Resize ───────────────────────────────────────────
        if target_width_mm and target_height_mm:
            resize_out = out_pdf.parent / "prepare_resized.pdf"
            self.resize_pages(
                current, resize_out,
                width_mm=target_width_mm,
                height_mm=target_height_mm,
                fit_mode=fit_mode,
                dominant_orientation=dominant_orientation,
            )
            stats["steps"].append("resize")
            current = resize_out

        # ── Final: copy to out_pdf ───────────────────────────────────
        if current != out_pdf:
            shutil.copy2(str(current), str(out_pdf))

        return stats


    # ------------------------------------------------------------------
    # Smart-assembly helpers (size detect, bleed detect / expand, spec hash)
    # ------------------------------------------------------------------
    def page_trim_size_mm(self, src: Path) -> tuple[float, float] | None:
        """Return the (width_mm, height_mm) of the first page's TrimBox
        (falling back to MediaBox honouring /Rotate). None on failure."""
        try:
            with pikepdf.open(str(src)) as pdf:
                if not pdf.pages:
                    return None
                page = pdf.pages[0]
                box = None
                for k in ("/TrimBox", "/CropBox", "/MediaBox"):
                    if k in page:
                        box = page[k]
                        break
                if box is None:
                    return None
                llx, lly, urx, ury = (float(box[i]) for i in range(4))
                w_pt, h_pt = urx - llx, ury - lly
                rotate = int(page.get("/Rotate", 0)) % 360
                if rotate in (90, 270):
                    w_pt, h_pt = h_pt, w_pt
                return (w_pt / mm, h_pt / mm)
        except Exception as exc:
            logger.warning("page_trim_size_mm failed: %s", exc)
            return None

    def detect_bleed(self, src: Path, min_bleed_mm: float = 1.0) -> bool:
        """Heuristic: True if the first page's MediaBox extends at least
        ``min_bleed_mm`` beyond its TrimBox on every side."""
        try:
            with pikepdf.open(str(src)) as pdf:
                if not pdf.pages:
                    return False
                page = pdf.pages[0]
                if "/TrimBox" not in page or "/MediaBox" not in page:
                    return False
                t = [float(x) for x in page["/TrimBox"]]
                m = [float(x) for x in page["/MediaBox"]]
                # [llx, lly, urx, ury]
                inset_pt = min_bleed_mm * mm
                return (
                    (t[0] - m[0]) >= inset_pt
                    and (t[1] - m[1]) >= inset_pt
                    and (m[2] - t[2]) >= inset_pt
                    and (m[3] - t[3]) >= inset_pt
                )
        except Exception:
            return False

    def expand_for_bleed(
        self,
        src: Path,
        out_pdf: Path,
        bleed_mm: float = 3.0,
    ) -> Path:
        """Manufacture bleed by uniformly scaling each page's content up so
        the visible area extends `bleed_mm` beyond the original trim on every
        side. The MediaBox grows by 2*bleed in each dimension; the original
        trim is recorded as the new TrimBox so downstream imposition still
        knows where the cut line is.

        Edge content is stretched slightly — operator should know this was
        fabricated bleed (caller records a warning)."""
        bleed_pt = bleed_mm * mm
        with pikepdf.open(str(src)) as pdf:
            for page in pdf.pages:
                # Use current MediaBox as the "trim" reference (we assume no
                # real bleed — detect_bleed gated this call).
                m = [float(x) for x in page.MediaBox]
                w = m[2] - m[0]
                h = m[3] - m[1]
                if w <= 0 or h <= 0:
                    continue
                sx = (w + 2 * bleed_pt) / w
                sy = (h + 2 * bleed_pt) / h
                # Scale uniformly by the smaller axis to avoid distortion,
                # then re-centre.
                s = min(sx, sy)
                tx = (w - w * s) / 2 - bleed_pt
                ty = (h - h * s) / 2 - bleed_pt
                # Wrap existing content in a save/scale/restore matrix
                cm = f"q\n{s} 0 0 {s} {tx} {ty} cm\n".encode()
                end = b"\nQ\n"
                page.contents_add(cm, prepend=True)
                page.contents_add(end, prepend=False)
                # Update boxes
                new_media = [
                    m[0] - bleed_pt, m[1] - bleed_pt,
                    m[2] + bleed_pt, m[3] + bleed_pt,
                ]
                page.MediaBox = new_media
                page.TrimBox = m  # original size is the trim
                if "/BleedBox" in page:
                    del page["/BleedBox"]
                page.BleedBox = new_media
            pdf.save(str(out_pdf))
        return out_pdf

    @staticmethod
    def spec_hash(inputs: dict) -> str:
        """Stable hash of the inputs that produced a print-ready PDF.
        Used as a cache key so re-clicking 'Assemble' is instant when
        nothing material has changed."""
        import hashlib, json
        canonical = json.dumps(inputs, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()[:32]


pdf_ops = PdfOps()

