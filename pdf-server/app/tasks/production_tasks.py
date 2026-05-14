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
# 1. Smart assembly
# ---------------------------------------------------------------------------
@shared_task(bind=True, queue="documents")
def assemble_print_ready_for_job(self, job_id: str, pdf_job_id: str):
    """Merge the job's source PDFs (in document order) into one print-ready PDF."""
    db = _db()
    try:
        job_repo.mark_running(db, pdf_job_id)
        bundle = load_job_bundle(job_id)

        if not bundle.asset_paths:
            raise ValueError(
                "No source PDFs available for this job. The customer hasn't uploaded files yet."
            )

        with Workspace() as ws:
            files: list[Path] = []
            for idx, (fname, path) in enumerate(bundle.asset_paths):
                local = ws.path(f"{idx:03d}-{Path(fname).stem}.pdf")
                storage.download(path, local)
                files.append(local)

            out_pdf = ws.path("print-ready.pdf")
            pdf_ops.merge(files, out_pdf)

            job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
            storage_path = unique_name(f"production/print-ready/{job_number}", ".pdf")
            storage.upload(out_pdf, storage_path, "application/pdf")

        write_artefact_path(job_id, "print_ready_pdf_path", storage_path)
        result = {"storage_path": storage_path, "asset_count": len(bundle.asset_paths)}
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
                sheets = pdf_ops.impose_with_template(
                    source_pdf=src,
                    template_pdf=template.local_pdf,
                    slots=template.slots,
                    n_up=template.n_up,
                    out_pdf=out_pdf,
                )

                job_number = _safe(bundle.job.get("job_number"), pdf_job_id[:8])
                storage_path = unique_name(f"production/imposed/{job_number}", ".pdf")
                storage.upload(out_pdf, storage_path, "application/pdf")

                write_artefact_path(job_id, "imposed_pdf_path", storage_path)
                write_job_field(job_id, "imposition_n_up", template.n_up)

                result = {
                    "storage_path": storage_path,
                    "strategy": "template",
                    "template_id": str(template_id),
                    "template_name": template.name,
                    "n_up": template.n_up,
                    "sheets": sheets,
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
