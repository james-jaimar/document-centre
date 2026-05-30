"""Production-pipeline celery tasks.

Three operator-facing artefacts, each fully resolved server-side from a
single `job_id` (no client-side composition):

- ``assemble_print_ready_for_job``  → merged, ordered PDF for the press
- ``assemble_imposed_sheet_for_job`` → press-sheet imposition
- ``render_job_ticket_for_job``     → 1-page A4 operator ticket

All three persist the resulting storage path back onto the matching
`order_jobs` column so the admin UI can open them immediately.
"""
from __future__ import annotations

import io
import traceback
from datetime import datetime
from pathlib import Path

from celery import shared_task

from app.db.session import SessionLocal
from app.services.files import Workspace, unique_name
from app.services.jobs import job_repo
from app.services.pdf_ops import pdf_ops
from app.services.imposition_templates import load_imposition_template
from app.services.production_orchestrator import (
    JobBundle,
    load_job_bundle,
    write_artefact_path,
    write_job_field,
)
from app.services.storage import StorageService

storage = StorageService()


def _db():
    return SessionLocal()


def _safe(value, fallback="—"):
    if value is None:
        return fallback
    s = str(value).strip()
    return s if s else fallback


# ---------------------------------------------------------------------------
# 1. Smart print-ready assembly
# ---------------------------------------------------------------------------
# Diff-driven: compare the customer-chosen spec (size, orientation, colour
# mode, print-to-edge) to what's already in their uploaded PDF(s) and only
# do the work that's actually needed. If nothing's needed and there's just
# one document, reuse the source path verbatim (no new bytes uploaded).
#
# Triggered on order payment via the `enqueue-print-ready` edge function;
# operators can also re-run manually from the production panel. Passing
# ``force=True`` bypasses the spec-hash cache.
@shared_task(bind=True, queue="documents")
def assemble_print_ready_for_job(self, job_id: str, pdf_job_id: str, force: bool = False):
    """Build the canonical print-ready PDF for a job, doing only the work needed."""
    db = _db()
    try:
        job_repo.mark_running(db, pdf_job_id)
        bundle = load_job_bundle(job_id)

        # ── Photo-prints branch ─────────────────────────────────────────
        # Photo-prints jobs upload raw images (JPEG/PNG/etc.) instead of
        # PDFs and carry their assembly spec on configuration.photo_prints.
        # Handle them with a dedicated assembler that crops + paginates
        # one page per copy, then short-circuits the document pipeline.
        from app.services.photo_prints_assembly import (
            is_photo_prints_job,
            assemble_photo_prints,
        )
        if is_photo_prints_job(bundle):
            cfg_pp = (bundle.configuration or {}).get("photo_prints") if isinstance(bundle.configuration, dict) else None
            photo_spec_inputs = {
                "engine": "photo_prints",
                "print_size_slug": (cfg_pp or {}).get("print_size_slug"),
                "finish_slug": (cfg_pp or {}).get("finish_slug"),
                "border_slug": (cfg_pp or {}).get("border_slug"),
                "photos": [
                    {
                        "id": p.get("id"),
                        "src": p.get("original_storage_path"),
                        "rotation": p.get("rotation"),
                        "crop": p.get("croppedAreaPixels"),
                        "qty": p.get("quantity"),
                    }
                    for p in ((cfg_pp or {}).get("photos") or [])
                    if isinstance(p, dict)
                ],
                "photo_pipeline_version": 1,
            }
            photo_hash = pdf_ops.spec_hash(photo_spec_inputs)
            existing_hash = bundle.job.get("print_ready_spec_hash")
            existing_path = bundle.job.get("print_ready_pdf_path")
            if (not force) and existing_hash == photo_hash and existing_path:
                result = {
                    "storage_path": existing_path,
                    "reused_cache": True,
                    "spec_hash": photo_hash,
                }
                job_repo.mark_done(db, pdf_job_id, result)
                return result

            from datetime import datetime, timezone
            job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
            with Workspace() as ws:
                storage_path, report = assemble_photo_prints(bundle, ws, job_number)

            write_artefact_path(job_id, "print_ready_pdf_path", storage_path)
            write_job_field(job_id, "assembly_report", report)
            write_job_field(job_id, "print_ready_spec_hash", photo_hash)
            write_job_field(job_id, "print_ready_assembled_at", datetime.now(timezone.utc).isoformat())

            result = {
                "storage_path": storage_path,
                "reused_cache": False,
                "spec_hash": photo_hash,
                **report,
            }
            job_repo.mark_done(db, pdf_job_id, result)
            return result

        if not bundle.asset_paths:
            cfg = bundle.configuration or {}
            src_item = cfg.get("source_order_item_id") if isinstance(cfg, dict) else None
            raise ValueError(
                "No source PDFs resolved for this job. Tried snapshot "
                "(merge_directives / source_assets), cart tables "
                "(order_items → documents → assets) and upload-path heuristic. "
                f"job_id={job_id}, source_order_item_id={src_item}"
            )


        target = bundle.target
        # Spec hash short-circuits repeat work.
        # Per-section colour/duplex flags feed the cache hash so existing
        # cached artefacts re-invalidate when the colour-mode fix is deployed
        # (or when a customer edits a section's is_color/is_duplex).
        snap_sections = (bundle.job.get("product_snapshot") or {}).get("sections") or []
        section_flags = [
            {
                "section_type": s.get("section_type"),
                "is_color": s.get("is_color"),
                "is_duplex": s.get("is_duplex"),
            }
            for s in snap_sections if isinstance(s, dict)
        ]
        spec_inputs = {
            "sources": [p for _, p in bundle.asset_paths],
            "target_w": target.width_mm,
            "target_h": target.height_mm,
            "orientation": target.orientation,
            "colour_mode": target.colour_mode,
            "duplex_mode": target.duplex_mode,
            "print_to_edge": target.print_to_edge,
            "bleed_mm": target.bleed_mm,
            # Include merge directives so simplex-cover blank insertion
            # invalidates the cached artefact when directives change.
            "merge_directives": (bundle.configuration or {}).get("merge_directives") if isinstance(bundle.configuration, dict) else None,
            "section_flags": section_flags,
            # Bump to invalidate caches when the colour pipeline changes.
            # v6: per-section greyscale for mixed colour jobs + duplex_mode
            # wired into TargetSpec + orientation-transpose resize guard.
            "colour_pipeline_version": 6,
        }

        new_hash = pdf_ops.spec_hash(spec_inputs)
        existing_hash = bundle.job.get("print_ready_spec_hash")
        existing_path = bundle.job.get("print_ready_pdf_path")
        if (not force) and existing_hash == new_hash and existing_path:
            result = {
                "storage_path": existing_path,
                "reused_cache": True,
                "spec_hash": new_hash,
            }
            job_repo.mark_done(db, pdf_job_id, result)
            return result

        warnings: list[str] = []
        steps: list[str] = []

        with Workspace() as ws:
            # ── Resolve source order ─────────────────────────────────────
            # If the order placed merge_directives, honour them so simplex
            # covers receive real blank pages in the merged output. Falls
            # back to plain document order when no directives are present.
            directives = []
            cfg = bundle.configuration or {}
            if isinstance(cfg, dict):
                raw = cfg.get("merge_directives") or []
                if isinstance(raw, list):
                    directives = raw

            files: list[Path] = []
            section_used_any = False
            per_section_colour: list[dict] = []

            # Pre-greyscale a single source file (used for mixed-colour jobs
            # so colour sections stay colour and B&W sections get the full
            # verifier-gated grayscale ladder before merge).
            def _greyscale_file(idx: int, src_local: Path, label: str) -> Path:
                grey_local = ws.path(f"{idx:03d}-{label}-grey.pdf")
                pdf_ops.grayscale(src_local, grey_local)
                rep = getattr(pdf_ops, "last_grayscale_report", None)
                per_section_colour.append({"label": label, "report": rep})
                return grey_local

            if directives and bundle.section_paths:
                from pypdf import PdfWriter

                # Helper: build a blank one-page PDF sized to the target spec
                # (or A4 fallback in points: 1 mm = 2.83465 pt).
                def _make_blank(idx: int) -> Path:
                    tw_mm = target.width_mm or 210.0
                    th_mm = target.height_mm or 297.0
                    w_pt = float(tw_mm) * 2.83464567
                    h_pt = float(th_mm) * 2.83464567
                    if target.orientation == "landscape" and w_pt < h_pt:
                        w_pt, h_pt = h_pt, w_pt
                    elif target.orientation == "portrait" and w_pt > h_pt:
                        w_pt, h_pt = h_pt, w_pt
                    out = ws.path(f"{idx:03d}-blank.pdf")
                    writer = PdfWriter()
                    writer.add_blank_page(width=w_pt, height=h_pt)
                    with open(out, "wb") as f:
                        writer.write(f)
                    return out

                downloaded: dict[str, Path] = {}
                # For "mixed" colour jobs we want to greyscale only the
                # sections flagged is_color=False; the rest stay colour.
                # For whole-doc "bw" jobs we let the downstream step handle
                # greyscale (single pass over the merged file).
                mixed_colour = target.colour_mode == "mixed"

                for idx, d in enumerate(directives):
                    if not isinstance(d, dict):
                        continue
                    kind = d.get("kind")
                    if kind == "section":
                        sid = d.get("section_id")
                        resolved = bundle.section_paths.get(sid) if sid else None
                        if not resolved:
                            continue
                        fname, path = resolved
                        # Download once per source path (covers reused assets).
                        if path in downloaded:
                            local = downloaded[path]
                        else:
                            local = ws.path(f"{idx:03d}-{Path(fname).stem}.pdf")
                            storage.download(path, local)
                            downloaded[path] = local

                        section_is_color = d.get("is_color")
                        # Per-section greyscale (mixed jobs only). If the
                        # directive doesn't carry the flag (older snapshot),
                        # leave the file colour and let the whole-doc step
                        # decide based on TargetSpec.
                        if mixed_colour and section_is_color is False:
                            label = (d.get("section_type") or "section").replace(" ", "_")
                            local = _greyscale_file(idx, local, label)
                            steps.append(f"greyscale_section:{label}")

                        files.append(local)

                        # Simplex section with odd page count → insert real
                        # blank back page so the press doesn't print on the
                        # back of the next section. Covers already handled
                        # at snapshot time via blank_page directives.
                        if d.get("is_duplex") is False:
                            section_type = d.get("section_type") or ""
                            if section_type not in ("front_cover", "back_cover"):
                                try:
                                    from pypdf import PdfReader as _R
                                    pc = len(_R(str(local)).pages)
                                except Exception:
                                    pc = d.get("page_count") or 0
                                if pc and pc % 2 == 1:
                                    files.append(_make_blank(idx))
                                    steps.append(f"blank:simplex_back:{section_type or 'section'}")

                        section_used_any = True
                    elif kind == "blank_page":
                        files.append(_make_blank(idx))
                        steps.append(f"blank:{d.get('reason') or 'unknown'}")

            if not section_used_any:
                # ── Fallback: download all sources in document order ─────
                files = []
                for idx, (fname, path) in enumerate(bundle.asset_paths):
                    local = ws.path(f"{idx:03d}-{Path(fname).stem}.pdf")
                    storage.download(path, local)
                    files.append(local)

            # ── Step 1: merge (only when >1 doc) ────────────────────────
            if len(files) > 1:
                merged = ws.path("merged.pdf")
                pdf_ops.merge(files, merged)
                current = merged
                steps.append(f"merge:{len(files)}")
            elif len(files) == 1:
                current = files[0]
            else:
                raise ValueError("No source files resolved from merge directives or asset paths.")

            # ── Step 2: detect what work the spec actually requires ─────
            actual_size = pdf_ops.page_trim_size_mm(current)
            needs_resize = False
            if target.width_mm and target.height_mm and actual_size:
                aw, ah = actual_size
                tw, th = target.width_mm, target.height_mm
                # Tolerance: 2mm in either dimension
                if abs(aw - tw) > 2 or abs(ah - th) > 2:
                    needs_resize = True
                # Orientation mismatch: target is portrait but page is
                # landscape (or vice-versa) even when dimensions transpose
                # to the same paper — force a resize so resize_pages can
                # rotate to the dominant orientation.
                elif target.orientation:
                    page_is_landscape = aw > ah
                    target_is_landscape = target.orientation == "landscape"
                    if page_is_landscape != target_is_landscape:
                        needs_resize = True

            needs_bleed = target.print_to_edge and not pdf_ops.detect_bleed(current)
            # Whole-doc greyscale only when *every* printable section is B&W.
            # Mixed jobs are handled per-file above the merge.
            needs_greyscale = target.colour_mode == "bw"

            # ── Step 3: resize / re-orient ──────────────────────────────
            if needs_resize and target.width_mm and target.height_mm:
                resized = ws.path("resized.pdf")
                # Honour TrimBox when the merged source has real bleed —
                # otherwise the customer-uploaded crop marks get scaled
                # into the finished artwork.
                source_has_trim = pdf_ops.detect_bleed(current)
                pdf_ops.resize_pages(
                    current, resized,
                    width_mm=target.width_mm,
                    height_mm=target.height_mm,
                    fit_mode="fit",
                    dominant_orientation=target.orientation,
                    respect_trim_box=source_has_trim,
                )
                current = resized
                steps.append(f"resize:{target.width_mm:.0f}x{target.height_mm:.0f}")

            # ── Step 4: expand for bleed (only if missing) ──────────────
            if needs_bleed:
                bled = ws.path("bled.pdf")
                pdf_ops.expand_for_bleed(current, bled, bleed_mm=target.bleed_mm)
                current = bled
                steps.append(f"bleed:{target.bleed_mm}mm")
                warnings.append(
                    "Bleed was auto-fabricated by scaling content up — edge content may clip."
                )

            # ── Step 5: greyscale (whole-doc B&W jobs) ──────────────────
            colour_check: dict | None = None
            if needs_greyscale:
                grey = ws.path("grey.pdf")
                pdf_ops.grayscale(current, grey)
                current = grey
                steps.append("greyscale")
                # grayscale() runs the verifier-gated ladder and stashes its
                # report (winning strategy + per-attempt metrics) on the
                # PdfOps instance. Surface that to the operator.
                colour_check = getattr(pdf_ops, "last_grayscale_report", None)
                if colour_check is None:
                    try:
                        colour_check = {
                            "black_text_check": pdf_ops.verify_pure_black_text(grey),
                            "colour_leak_check": pdf_ops.verify_no_colour_leak(grey),
                        }
                    except Exception as exc:
                        colour_check = {"checked": False, "reason": f"verify_raised: {exc}"}
            elif per_section_colour:
                # Mixed-colour job: report per-section greyscale outcomes.
                colour_check = {"mode": "mixed", "sections": per_section_colour}




            # ── Decide where the result lives ───────────────────────────
            if not steps and len(files) == 1:
                # Nothing changed — reuse the uploaded path verbatim, no upload.
                storage_path = bundle.asset_paths[0][1]
                reused_source = True
            else:
                job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
                storage_path = unique_name(f"production/print-ready/{job_number}", ".pdf")
                storage.upload(current, storage_path, "application/pdf")
                reused_source = False

        # ── Persist artefact + report ───────────────────────────────────
        from datetime import datetime, timezone
        report = {
            "reused_source": reused_source,
            "reused_cache": False,
            "steps": steps,
            "warnings": warnings,
            "source_count": len(bundle.asset_paths),
            "target": {
                "width_mm": target.width_mm,
                "height_mm": target.height_mm,
                "orientation": target.orientation,
                "colour_mode": target.colour_mode,
                "duplex_mode": target.duplex_mode,
                "print_to_edge": target.print_to_edge,
                "bleed_mm": target.bleed_mm,
            },

            "detected_size_mm": list(actual_size) if actual_size else None,
            "colour_check": colour_check,
        }
        write_artefact_path(job_id, "print_ready_pdf_path", storage_path)
        write_job_field(job_id, "assembly_report", report)
        write_job_field(job_id, "print_ready_spec_hash", new_hash)
        write_job_field(job_id, "print_ready_assembled_at", datetime.now(timezone.utc).isoformat())

        result = {"storage_path": storage_path, **report, "spec_hash": new_hash}
        job_repo.mark_done(db, pdf_job_id, result)
        return result
    except Exception as exc:
        job_repo.mark_failed(db, pdf_job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 2. Imposition
# ---------------------------------------------------------------------------
def _imposition_strategy(bundle: JobBundle) -> str:
    """Pick imposition strategy from the product snapshot.

    Returns one of: "nup", "booklet", "none".
    Honours `production_specs.imposition_strategy` override when admins set it.
    """
    job = bundle.job
    override = (job.get("production_specs") or {}).get("imposition_strategy")
    if override in {"nup", "booklet", "none"}:
        return override

    snap = job.get("product_snapshot") or {}
    family = (snap.get("family") or job.get("product_category") or "").lower()
    binding = (snap.get("binding") or "").lower()

    if "saddle" in binding or "stitch" in binding:
        return "booklet"
    if any(k in family for k in ("flyer", "postcard", "card", "leaflet", "loose")):
        return "nup"
    return "none"


def _press_sheet_size_mm(bundle: JobBundle) -> tuple[float, float]:
    """Default press sheet — SRA3. Tenant override via production_specs.press_sheet."""
    spec = (bundle.job.get("production_specs") or {}).get("press_sheet")
    if isinstance(spec, dict) and spec.get("width_mm") and spec.get("height_mm"):
        return float(spec["width_mm"]), float(spec["height_mm"])
    return 320.0, 450.0  # SRA3


@shared_task(bind=True, queue="imposition")
def assemble_imposed_sheet_for_job(self, job_id: str, pdf_job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, pdf_job_id)
        bundle = load_job_bundle(job_id)

        source_path = bundle.job.get("print_ready_pdf_path")
        if not source_path:
            raise ValueError("Print-ready PDF must be assembled before imposition.")

        template_id = bundle.job.get("imposition_template_id")

        with Workspace() as ws:
            src = ws.path("source.pdf")
            storage.download(source_path, src)
            out_pdf = ws.path("imposed.pdf")

            # ---------- Template-driven imposition (preferred) ----------
            if template_id:
                template = load_imposition_template(str(template_id), ws.path("template"))

                if template.kind == "template_pdf":
                    sheets = pdf_ops.impose_with_template(
                        source_pdf=src,
                        template_pdf=template.local_pdf,
                        slots=template.slots,
                        n_up=template.n_up,
                        out_pdf=out_pdf,
                    )
                    extra = {"sheets": sheets}
                elif template.kind == "parametric_nup":
                    sheets = pdf_ops.impose_nup_trimbox(
                        src, out_pdf,
                        columns=template.columns,
                        rows=template.rows,
                        sheet_width_mm=template.output_width_mm,
                        sheet_height_mm=template.output_height_mm,
                        bleed_mm=template.bleed_mm,
                        gutter_mm=template.gutter_mm,
                        crop_mark_offset_mm=template.crop_mark_offset_mm,
                        crop_mark_length_mm=template.crop_mark_length_mm,
                        show_crop_marks=template.has_crop_marks,
                        show_registration=template.show_registration,
                        fallback_trim_inset_mm=template.fallback_trim_inset_mm,
                    )
                    extra = {"stats": sheets}
                elif template.kind == "parametric_booklet":
                    sheets = pdf_ops.booklet_saddle_stitch(
                        src, out_pdf,
                        sheet_width_mm=template.output_width_mm,
                        sheet_height_mm=template.output_height_mm,
                        bleed_mm=template.bleed_mm,
                        creep_per_sheet_mm=template.creep_per_sheet_mm,
                    )
                    extra = {"stats": sheets}
                else:
                    raise ValueError(f"Unknown template kind: {template.kind}")

                job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
                storage_path = unique_name(f"production/imposed/{job_number}", ".pdf")
                storage.upload(out_pdf, storage_path, "application/pdf")

                write_artefact_path(job_id, "imposed_pdf_path", storage_path)
                write_job_field(job_id, "imposition_n_up", template.n_up)

                result = {
                    "storage_path": storage_path,
                    "strategy": template.kind,
                    "template_id": str(template_id),
                    "template_name": template.name,
                    "n_up": template.n_up,
                    **extra,
                }
                job_repo.mark_done(db, pdf_job_id, result)
                return result

            # ---------- Legacy product-aware fallback ----------
            strategy = _imposition_strategy(bundle)
            if strategy == "none":
                # No-op imposition: copy the print-ready PDF into the imposed slot
                # so the workflow stays consistent for operators.
                write_artefact_path(job_id, "imposed_pdf_path", source_path)
                result = {"storage_path": source_path, "strategy": "none", "note": "1-up"}
                job_repo.mark_done(db, pdf_job_id, result)
                return result

            sheet_w, sheet_h = _press_sheet_size_mm(bundle)
            spec = bundle.job.get("production_specs") or {}
            bleed_mm = float(spec.get("bleed_mm") or 3.0)
            gutter_mm = float(spec.get("gutter_mm") or 0.0)
            creep_mm = float(spec.get("creep_per_sheet_mm") or 0.0)

            if strategy == "booklet":
                stats = pdf_ops.booklet_saddle_stitch(
                    src, out_pdf,
                    sheet_width_mm=sheet_w,
                    sheet_height_mm=sheet_h,
                    bleed_mm=bleed_mm,
                    creep_per_sheet_mm=creep_mm,
                )
            else:
                # n-up: figure out columns/rows from finished size vs sheet size
                snap = bundle.job.get("product_snapshot") or {}
                fw = float(snap.get("width_mm") or 100)
                fh = float(snap.get("height_mm") or 150)
                pitch_w = fw + gutter_mm
                pitch_h = fh + gutter_mm
                cols = max(1, int((sheet_w - 2 * bleed_mm + gutter_mm) // pitch_w))
                rows = max(1, int((sheet_h - 2 * bleed_mm + gutter_mm) // pitch_h))
                stats = pdf_ops.impose_nup_trimbox(
                    src, out_pdf,
                    columns=cols, rows=rows,
                    sheet_width_mm=sheet_w, sheet_height_mm=sheet_h,
                    bleed_mm=bleed_mm,
                    gutter_mm=gutter_mm,
                    fallback_trim_inset_mm=bleed_mm,
                )

            job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
            storage_path = unique_name(f"production/imposed/{job_number}", ".pdf")
            storage.upload(out_pdf, storage_path, "application/pdf")

        write_artefact_path(job_id, "imposed_pdf_path", storage_path)
        result = {
            "storage_path": storage_path,
            "strategy": strategy,
            "sheet_mm": [sheet_w, sheet_h],
            "stats": stats,
        }
        job_repo.mark_done(db, pdf_job_id, result)
        return result
    except Exception as exc:
        job_repo.mark_failed(db, pdf_job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 3. Job ticket
# ---------------------------------------------------------------------------
def _hex_to_rl_color(hex_str: str | None, fallback="#1e293b"):
    """Convert '#RRGGBB' (or shorthand) to a reportlab HexColor; fall back on error."""
    from reportlab.lib import colors
    try:
        s = (hex_str or "").strip()
        if not s:
            return colors.HexColor(fallback)
        if not s.startswith("#"):
            s = "#" + s
        if len(s) == 4:  # #abc → #aabbcc
            s = "#" + "".join(c * 2 for c in s[1:])
        return colors.HexColor(s)
    except Exception:
        return colors.HexColor(fallback)


def _format_money(amount, currency="ZAR"):
    try:
        a = float(amount)
    except Exception:
        return "—"
    sym = "R" if (currency or "").upper() == "ZAR" else (currency or "")
    return f"{sym} {a:,.2f}"


def _format_filesize(n):
    try:
        n = float(n)
    except Exception:
        return "—"
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} TB"


def _fetch_logo_image(url: str | None, max_height_mm: float = 16.0):
    """Download a tenant logo and return a reportlab Image, or None."""
    if not url:
        return None
    try:
        import httpx
        from reportlab.platypus import Image as RLImage
        from reportlab.lib.units import mm
        r = httpx.get(url, timeout=5.0, follow_redirects=True)
        r.raise_for_status()
        buf = io.BytesIO(r.content)
        img = RLImage(buf)
        # Scale to fixed height, preserve aspect.
        iw, ih = img.imageWidth, img.imageHeight
        if ih > 0:
            scale = (max_height_mm * mm) / ih
            img.drawHeight = max_height_mm * mm
            img.drawWidth = iw * scale
        return img
    except Exception:
        return None


def _render_ticket_pdf(bundle: JobBundle, dest: Path) -> None:
    """Render a 1-page A4 operator job ticket.

    Layout goals:
      - Clean white header with the tenant logo in a white box so red/dark logos
        stay legible regardless of brand colour.
      - Brand colour used only as a thin accent rule and for small section labels.
      - No pricing — this is a work ticket, not an invoice.
      - Mirror the admin Job Details panel: status badges, quantity, the full
        `configuration.summary` + `configuration.sections[]` block, and the
        source-files list (with `bundle.asset_paths` fallback).
      - Writable production fields: Due, Operator, Started, Completed, QC, Notes.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
    )

    job = bundle.job
    snap = job.get("product_snapshot") or {}
    cfg = job.get("configuration") or {}
    order = bundle.order or {}
    branch = bundle.branch or {}
    branding = bundle.branding or {}
    customer = bundle.customer or {}
    delivery = bundle.delivery_address or {}

    brand_hex = branding.get("primary_color") or "#1e293b"
    brand = _hex_to_rl_color(brand_hex, "#1e293b")
    ink = colors.HexColor("#0f172a")
    muted = colors.HexColor("#64748b")
    rule = colors.HexColor("#e2e8f0")
    panel_bg = colors.HexColor("#f8fafc")

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle("tk_title", parent=styles["Heading1"], fontSize=20, leading=22, textColor=ink, spaceAfter=0)
    h_sub = ParagraphStyle("tk_sub", parent=styles["BodyText"], fontSize=9, leading=11, textColor=muted)
    h_section = ParagraphStyle("tk_section", parent=styles["BodyText"], fontSize=8, leading=10,
                               textColor=brand, fontName="Helvetica-Bold", spaceAfter=3)
    body = ParagraphStyle("tk_body", parent=styles["BodyText"], fontSize=9, leading=11.5, textColor=ink)
    body_b = ParagraphStyle("tk_body_b", parent=body, fontName="Helvetica-Bold")
    body_mute = ParagraphStyle("tk_body_mute", parent=body, textColor=muted)
    small = ParagraphStyle("tk_small", parent=styles["BodyText"], fontSize=7.5, leading=9, textColor=muted)
    branch_name_s = ParagraphStyle("tk_branch", parent=body_b, fontSize=11, leading=13, textColor=ink)

    flow = []

    # ------------------------------------------------------------------
    # 1. Header — white background, logo in a white box, brand accent rule
    # ------------------------------------------------------------------
    branch_name = _safe(
        branch.get("trading_name") or branch.get("name") or (bundle.tenant or {}).get("name"),
        "Branch",
    )
    branch_addr = ", ".join([p for p in [
        branch.get("address"), branch.get("city"), branch.get("province"), branch.get("postal_code"),
    ] if p])
    branch_contact_bits = [p for p in [branch.get("phone"), branch.get("email")] if p]
    branch_contact = "  ·  ".join(branch_contact_bits)

    logo = _fetch_logo_image(branding.get("logo_url"), max_height_mm=14.0)
    logo_cell = logo or Paragraph("", body)

    branch_block = [
        [Paragraph(branch_name, branch_name_s)],
    ]
    if branch_addr:
        branch_block.append([Paragraph(branch_addr, h_sub)])
    if branch_contact:
        branch_block.append([Paragraph(branch_contact, h_sub)])
    branch_tbl = Table(branch_block, colWidths=[110 * mm])
    branch_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    job_ticket_lbl = Paragraph(
        f"<font color='#64748b' size='8'>JOB TICKET</font><br/>"
        f"<font color='#0f172a' size='10'><b>{datetime.utcnow().strftime('%Y-%m-%d')}</b></font>",
        body,
    )

    header = Table([[logo_cell, branch_tbl, job_ticket_lbl]],
                   colWidths=[32 * mm, 110 * mm, 40 * mm])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 1.8, brand),
    ]))
    flow.append(header)
    flow.append(Spacer(1, 8))

    # ------------------------------------------------------------------
    # 2. Job identity row — job number + status chips + QR (no overlap)
    # ------------------------------------------------------------------
    job_no = _safe(job.get("job_number"), (job.get("id") or "")[:8])
    order_no = _safe(order.get("order_number"))
    qty = int(job.get("quantity") or 0)
    qty_sent = int(job.get("qty_sent") or 0)
    qty_remaining = int(job.get("qty_remaining") or max(qty - qty_sent, 0))
    product_name = _safe(job.get("job_name") or job.get("product_name") or snap.get("name"))

    status_chip = (job.get("job_status") or "new").replace("_", " ").title()
    proof_chip = (job.get("proof_status") or "not_required").replace("_", " ").title()
    urgency_chip = (job.get("urgency") or "standard").replace("_", " ").title()

    qr_image = None
    try:
        import qrcode
        order_id = job.get("order_id")
        url = f"https://document-centre.com/admin/orders/{order_id}" if order_id else "https://document-centre.com"
        qr = qrcode.QRCode(box_size=4, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qr_image = RLImage(buf, width=24 * mm, height=24 * mm)
    except Exception:
        qr_image = Paragraph("", body)

    identity_left = [
        [Paragraph(f"<b>{job_no}</b>  &nbsp; <font color='#64748b' size='9'>· Order {order_no}</font>", h_title)],
        [Paragraph(_safe(product_name), body_b)],
        [Paragraph(
            f"<font color='#64748b'>Status</font> <b>{status_chip}</b> &nbsp;·&nbsp; "
            f"<font color='#64748b'>Proof</font> <b>{proof_chip}</b> &nbsp;·&nbsp; "
            f"<font color='#64748b'>Urgency</font> <b>{urgency_chip}</b>",
            body,
        )],
        [Paragraph(
            f"<font color='#64748b'>Quantity</font> <b>{qty:,}</b> "
            f"<font color='#64748b'>({qty_sent:,} sent · {qty_remaining:,} remaining)</font>",
            body,
        )],
    ]
    id_tbl = Table(identity_left, colWidths=[155 * mm])
    id_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    identity = Table([[id_tbl, qr_image]], colWidths=[155 * mm, 27 * mm])
    identity.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(identity)
    flow.append(Spacer(1, 8))

    # ------------------------------------------------------------------
    # 3. Customer + Fulfilment + Due / Required by  (NO pricing)
    # ------------------------------------------------------------------
    cust_name = _safe(customer.get("full_name") or customer.get("email") or order.get("customer_name"))
    cust_company = customer.get("company") or (delivery.get("company_name") if delivery else None) or ""
    cust_email = customer.get("email") or order.get("customer_email") or ""
    cust_phone = customer.get("phone") or (delivery.get("phone") if delivery else "") or ""

    fulfilment_mode = (order.get("fulfilment_type") or order.get("delivery_method") or "collection").lower()
    is_delivery = fulfilment_mode in ("delivery", "shipping", "courier")

    if is_delivery and delivery:
        addr_lines = [
            delivery.get("contact_name") or "",
            delivery.get("line1") or "",
            delivery.get("line2") or "",
            ", ".join([p for p in [delivery.get("suburb"), delivery.get("city")] if p]),
            ", ".join([p for p in [delivery.get("province"), delivery.get("postal_code")] if p]),
            delivery.get("country") or "",
            delivery.get("phone") or "",
        ]
        fulfil_lines = ["<b>Delivery</b>"] + [l for l in addr_lines if l and l.strip(", ")]
    else:
        fulfil_lines = ["<b>Collection</b>",
                        branch.get("name") or branch.get("trading_name") or "",
                        branch.get("address") or "",
                        ", ".join([p for p in [branch.get("city"), branch.get("postal_code")] if p]),
                        branch.get("phone") or ""]
        fulfil_lines = [l for l in fulfil_lines if l]

    due_value = job.get("ready_at") or order.get("required_by") or order.get("delivery_date")
    turnaround = order.get("turnaround") or snap.get("turnaround") or "—"

    schedule_lines = [
        f"<font color='#64748b'>Date required</font><br/><b>{_safe(due_value)}</b>",
        f"<font color='#64748b'>Turnaround</font><br/><b>{_safe(turnaround)}</b>",
        "<font color='#64748b'>Due in shop by</font><br/><b>____ / ____ / ______</b>",
    ]

    def _panel(title: str, lines: list[str], width_mm: float):
        rows = [[Paragraph(title, h_section)]]
        for ln in lines:
            rows.append([Paragraph(ln, body)])
        t = Table(rows, colWidths=[width_mm * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), panel_bg),
            ("BOX", (0, 0), (-1, -1), 0.5, rule),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (0, 0), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
        ]))
        return t

    cust_lines = [l for l in [f"<b>{cust_name}</b>", cust_company, cust_email, cust_phone] if l]

    three_col = Table(
        [[_panel("CUSTOMER", cust_lines, 60),
          _panel("FULFILMENT", fulfil_lines, 60),
          _panel("SCHEDULE", schedule_lines, 60)]],
        colWidths=[60 * mm, 60 * mm, 60 * mm],
    )
    three_col.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(three_col)
    flow.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # 4. Production specs — mirror the admin Job Details panel
    #    Pulls from configuration.summary.primary_spec_*  and
    #    configuration.sections[] (label/value pairs).
    # ------------------------------------------------------------------
    flow.append(Paragraph("PRODUCTION SPECIFICATIONS", h_section))

    summary = (cfg.get("summary") or {}) if isinstance(cfg, dict) else {}
    cfg_sections = (cfg.get("sections") or []) if isinstance(cfg, dict) else []

    # Flatten all spec pairs (summary first, then every section's items) into
    # a single compact 3-column grid. Skip section titles — the labels carry
    # enough context (Paper Stock, Print Colour, etc.) and we need to stay
    # on a single A4 page.
    spec_pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def _push(label: str, value):
        if not label or value in (None, ""):
            return
        key = (label.strip().lower(), str(value).strip().lower())
        if key in seen:
            return
        seen.add(key)
        spec_pairs.append((label.strip(), str(value).strip()))

    for i in (1, 2, 3):
        _push(summary.get(f"primary_spec_{i}_label"), summary.get(f"primary_spec_{i}_value"))

    if isinstance(cfg_sections, list):
        for section in cfg_sections:
            if not isinstance(section, dict):
                continue
            for it in (section.get("items") or []):
                if isinstance(it, dict):
                    _push(it.get("label"), it.get("value"))

    # Legacy fallback when configuration is empty.
    if not spec_pairs:
        report = job.get("assembly_report") or {}
        resolved = report.get("target") if isinstance(report, dict) else {}
        if not isinstance(resolved, dict):
            resolved = {}
        size_str = None
        if resolved.get("width_mm") and resolved.get("height_mm"):
            size_str = f"{resolved['width_mm']:.0f}×{resolved['height_mm']:.0f}mm"
        for k, v in [
            ("Size", size_str or snap.get("size")),
            ("Orientation", resolved.get("orientation") or snap.get("orientation")),
            ("Paper", (cfg.get("paper") if isinstance(cfg, dict) else None) or snap.get("paper")),
            ("Colour", (resolved.get("colour_mode") or "").upper() or snap.get("colour")),
            ("Sides", (resolved.get("duplex_mode") or "").title() or snap.get("sides")),
            ("Binding", (cfg.get("binding") if isinstance(cfg, dict) else None) or snap.get("binding")),
        ]:
            _push(k, v)

    if spec_pairs:
        rows = []
        for i in range(0, len(spec_pairs), 3):
            chunk = spec_pairs[i:i + 3]
            cells = []
            for k, v in chunk:
                cells.append(Paragraph(
                    f"<font color='#64748b' size='7.5'>{k.upper()}</font><br/><b>{v}</b>",
                    body,
                ))
            while len(cells) < 3:
                cells.append(Paragraph("", body))
            rows.append(cells)
        specs_tbl = Table(rows, colWidths=[60 * mm, 60 * mm, 60 * mm])
        specs_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, rule),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, rule),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        flow.append(specs_tbl)

    flow.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # 5. Files — prefer bundle.documents, fall back to asset_paths
    # ------------------------------------------------------------------
    flow.append(Paragraph("SOURCE FILES", h_section))

    file_rows: list[list] = [[
        Paragraph("<b>#</b>", body),
        Paragraph("<b>File name</b>", body),
        Paragraph("<b>Pages</b>", body),
        Paragraph("<b>Page size</b>", body),
        Paragraph("<b>File size</b>", body),
    ]]

    if bundle.documents:
        for i, d in enumerate(bundle.documents, 1):
            meta = d.get("metadata") if isinstance(d.get("metadata"), dict) else {}
            preflight = d.get("preflight_data") if isinstance(d.get("preflight_data"), dict) else {}
            page_count = (d.get("page_count")
                          or meta.get("page_count")
                          or preflight.get("page_count"))
            pw = d.get("page_width_mm") or preflight.get("page_width_mm")
            ph = d.get("page_height_mm") or preflight.get("page_height_mm")
            try:
                size_label = f"{float(pw):.0f}×{float(ph):.0f}mm" if pw and ph else (meta.get("size_label") or "—")
            except Exception:
                size_label = "—"
            file_rows.append([
                Paragraph(str(i), body),
                Paragraph(_safe(d.get("file_name")), body),
                Paragraph(_safe(page_count), body),
                Paragraph(size_label, body),
                Paragraph(_format_filesize(d.get("file_size") or meta.get("file_size")), body),
            ])
    elif bundle.asset_paths:
        # Snapshot-based jobs: only the filename + storage path are available.
        for i, (fname, _path) in enumerate(bundle.asset_paths, 1):
            file_rows.append([
                Paragraph(str(i), body),
                Paragraph(_safe(fname), body),
                Paragraph("—", body),
                Paragraph("—", body),
                Paragraph("—", body),
            ])
    else:
        file_rows.append([
            Paragraph("", body),
            Paragraph("<i>No source files attached.</i>", body_mute),
            Paragraph("", body), Paragraph("", body), Paragraph("", body),
        ])

    files_table = Table(file_rows, colWidths=[8 * mm, 92 * mm, 18 * mm, 30 * mm, 32 * mm])
    files_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, rule),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, rule),
        ("BACKGROUND", (0, 0), (-1, 0), panel_bg),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(files_table)
    flow.append(Spacer(1, 12))

    # ------------------------------------------------------------------
    # 6. Operator sign-off — writable fields
    # ------------------------------------------------------------------
    flow.append(Paragraph("PRODUCTION SIGN-OFF", h_section))

    def _field(label: str, width_mm: float, height_mm: float = 9):
        cell = Table(
            [[Paragraph(f"<font color='#64748b' size='7.5'>{label.upper()}</font>", body)],
             [Paragraph("", body)]],
            colWidths=[width_mm * mm],
            rowHeights=[5 * mm, height_mm * mm],
        )
        cell.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, rule),
            ("LINEABOVE", (0, 1), (-1, 1), 0.4, rule),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return cell

    sign_row = Table(
        [[_field("Operator", 44),
          _field("QC", 44),
          _field("Started", 47),
          _field("Completed", 47)]],
        colWidths=[44 * mm, 44 * mm, 47 * mm, 47 * mm],
    )
    sign_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow.append(sign_row)
    flow.append(Spacer(1, 6))

    notes_cell = Table(
        [[Paragraph("<font color='#64748b' size='7.5'>NOTES</font>", body)],
         [Paragraph("", body)]],
        colWidths=[182 * mm],
        rowHeights=[5 * mm, 22 * mm],
    )
    notes_cell.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, rule),
        ("LINEABOVE", (0, 1), (-1, 1), 0.4, rule),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    flow.append(notes_cell)

    flow.append(Spacer(1, 6))
    flow.append(Paragraph(
        f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  ·  Powered by Document Centre",
        small,
    ))

    doc = SimpleDocTemplate(
        str(dest),
        pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=12 * mm, bottomMargin=10 * mm,
        title=f"Job Ticket {job.get('job_number') or ''}",
    )
    doc.build(flow)




@shared_task(bind=True, queue="documents")
def render_job_ticket_for_job(self, job_id: str, pdf_job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, pdf_job_id)
        bundle = load_job_bundle(job_id)

        with Workspace() as ws:
            out_pdf = ws.path("ticket.pdf")
            _render_ticket_pdf(bundle, out_pdf)

            job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
            storage_path = unique_name(f"production/tickets/{job_number}", ".pdf")
            storage.upload(out_pdf, storage_path, "application/pdf")

        write_artefact_path(job_id, "job_ticket_pdf_path", storage_path)
        result = {"storage_path": storage_path}
        job_repo.mark_done(db, pdf_job_id, result)
        return result
    except Exception as exc:
        job_repo.mark_failed(db, pdf_job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()
