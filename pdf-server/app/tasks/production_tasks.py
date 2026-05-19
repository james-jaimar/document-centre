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
                pdf_ops.resize_pages(
                    current, resized,
                    width_mm=target.width_mm,
                    height_mm=target.height_mm,
                    fit_mode="fit",
                    dominant_orientation=target.orientation,
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
                "print_to_edge": target.print_to_edge,
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
def _render_ticket_pdf(bundle: JobBundle, dest: Path) -> None:
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

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20, leading=22, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11, leading=13, textColor=colors.HexColor("#444"), spaceAfter=2)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontSize=7.5, leading=9, textColor=colors.HexColor("#666"))

    flow = []

    # --- Header ----------------------------------------------------------------
    tenant_name = _safe((bundle.tenant or {}).get("display_name") or (bundle.tenant or {}).get("name"), "Document Centre")
    flow.append(Paragraph(f"<b>{tenant_name}</b> — Job Ticket", h2))
    flow.append(Paragraph(_safe(job.get("job_number"), job.get("id", "")[:8]), h1))
    flow.append(Spacer(1, 4))

    # QR code → admin order detail
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
        qr_image = RLImage(buf, width=28 * mm, height=28 * mm)
    except Exception:
        qr_image = Paragraph("", body)

    # --- Top summary table -----------------------------------------------------
    customer_name = _safe((bundle.customer or {}).get("full_name") or (bundle.customer or {}).get("email"))
    order_no = _safe((bundle.order or {}).get("order_number"))
    due = _safe(job.get("ready_at") or (bundle.order or {}).get("delivery_date"))

    summary_rows = [
        [Paragraph("<b>Customer</b>", body), Paragraph(customer_name, body),
         Paragraph("<b>Order #</b>", body), Paragraph(order_no, body)],
        [Paragraph("<b>Product</b>", body), Paragraph(_safe(job.get("product_name") or snap.get("name")), body),
         Paragraph("<b>Due</b>", body), Paragraph(due, body)],
        [Paragraph("<b>Quantity</b>", body), Paragraph(_safe(int(job.get("quantity") or 0)), body),
         Paragraph("<b>Urgency</b>", body), Paragraph(_safe(job.get("urgency"), "standard"), body)],
    ]
    summary = Table(summary_rows, colWidths=[22 * mm, 60 * mm, 22 * mm, 50 * mm])
    summary.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#eee")),
    ]))

    header_table = Table([[summary, qr_image]], colWidths=[155 * mm, 30 * mm])
    header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    flow.append(header_table)
    flow.append(Spacer(1, 8))

    # --- Production specs ------------------------------------------------------
    flow.append(Paragraph("Production specs", h2))
    spec_keys = [
        ("Size", snap.get("size") or (f"{snap.get('width_mm')}×{snap.get('height_mm')}mm" if snap.get("width_mm") else None)),
        ("Paper", cfg.get("paper") or snap.get("paper")),
        ("Weight", f"{snap.get('paper_weight_gsm')}gsm" if snap.get("paper_weight_gsm") else None),
        ("Colour", cfg.get("colour") or snap.get("colour")),
        ("Sides", cfg.get("sides") or snap.get("sides")),
        ("Binding", cfg.get("binding") or snap.get("binding")),
        ("Cover", cfg.get("cover") or snap.get("cover")),
        ("Finishing", cfg.get("finishing") or snap.get("finishing")),
    ]
    spec_rows = [[Paragraph(f"<b>{k}</b>", body), Paragraph(_safe(v), body)] for k, v in spec_keys if v]
    if spec_rows:
        spec_table = Table(spec_rows, colWidths=[35 * mm, 150 * mm])
        spec_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#ddd")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#eee")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        flow.append(spec_table)
    flow.append(Spacer(1, 8))

    # --- Source files ----------------------------------------------------------
    flow.append(Paragraph("Source files", h2))
    if bundle.documents:
        rows = [[Paragraph("<b>#</b>", body), Paragraph("<b>File</b>", body),
                 Paragraph("<b>Pages</b>", body), Paragraph("<b>Size</b>", body)]]
        for i, d in enumerate(bundle.documents, 1):
            rows.append([
                Paragraph(str(i), body),
                Paragraph(_safe(d.get("file_name")), body),
                Paragraph(_safe((d.get("metadata") or {}).get("page_count")), body),
                Paragraph(_safe((d.get("metadata") or {}).get("size_label")), body),
            ])
        files_table = Table(rows, colWidths=[10 * mm, 110 * mm, 25 * mm, 40 * mm])
        files_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#ddd")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#eee")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f6f6f6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        flow.append(files_table)
    else:
        flow.append(Paragraph("<i>No source files attached.</i>", body))

    flow.append(Spacer(1, 14))

    # --- Sign-off --------------------------------------------------------------
    sign_rows = [
        [Paragraph("<b>Operator</b>", body), Paragraph("____________________", body),
         Paragraph("<b>Date</b>", body), Paragraph("____________________", body)],
        [Paragraph("<b>QC</b>", body), Paragraph("____________________", body),
         Paragraph("<b>Notes</b>", body), Paragraph("____________________", body)],
    ]
    sign_table = Table(sign_rows, colWidths=[20 * mm, 70 * mm, 20 * mm, 75 * mm])
    sign_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    flow.append(sign_table)
    flow.append(Spacer(1, 6))
    flow.append(Paragraph(
        f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} by Document Centre",
        small,
    ))

    doc = SimpleDocTemplate(
        str(dest),
        pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=12 * mm,
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
