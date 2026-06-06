import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.schemas.cloudprinter import CloudprinterRenderRequest, CloudprinterRenderResponse
from app.tasks.cloudprinter_tasks import cloudprinter_render

from app.db.session import get_db
from app.schemas.assets import (
    CropRasterizeRequest,
    GeneratePreviewsRequest,
    AssetCreate,
    AssetResponse,
    DerivedFileResponse,
    JobResponse,
    RotateRequest,
    GrayscaleRequest,
    CmykRequest,
    ResizeRequest,
    NupRequest,
    BookletRequest,
    MergeRequest,
    SheetImposeRequest,
    ConvertOfficeRequest,
    NormalizeOrientationRequest,
    PrintReadyRequest,
    RenderPagesRequest,
    PrepareForProductRequest,
    PadPagesRequest,
    JobArtefactRequest,
)
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.storage import StorageService
from app.services.derived_files import derived_file_repo
from app.services.diagnostics import get_diagnostics
from app.services.job_event_repo import job_event_repo
from app.tasks.document_tasks import (
    normalize_asset,
    inspect_asset,
    generate_previews,
    render_specific_pages,
)
from app.tasks.operation_tasks import (
    crop_rasterize,
    rotate_pdf,
    grayscale_pdf,
    cmyk_pdf,
    resize_pdf,
    nup_pdf,
    booklet_pdf,
    merge_pdfs,
    impose_sheet_pdf,
    convert_office,
    normalize_orientation,
    print_ready,
    prepare_for_product,
    pad_pages_pdf,
)
from app.tasks.production_tasks import (
    assemble_print_ready_for_job,
    assemble_imposed_sheet_for_job,
    render_job_ticket_for_job,
)
from app.core.queue import enqueue

api_router = APIRouter()
storage = StorageService()


def enrich_asset(asset: dict) -> dict:
    asset = dict(asset)
    asset["source_url"] = storage.public_url(asset["source_storage_path"]) if asset.get("source_storage_path") else None
    asset["normalized_url"] = storage.public_url(asset["normalized_storage_path"]) if asset.get("normalized_storage_path") else None
    asset["preview_url"] = storage.public_url(asset["preview_storage_path"]) if asset.get("preview_storage_path") else None
    asset["thumbnail_url"] = storage.public_url(asset["thumbnail_storage_path"]) if asset.get("thumbnail_storage_path") else None
    return asset


@api_router.post("/assets", response_model=dict)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db)):
    asset_id = asset_repo.create_asset(
        db, payload.model_dump(exclude={"auto_queue", "inline_inspect"})
    )
    job_ids: list[str] = []
    inline: dict | None = None

    is_pdf = (payload.media_type or "").lower() == "application/pdf" \
        or payload.original_filename.lower().endswith(".pdf")

    # ── Synchronous pikepdf probe ──────────────────────────────────
    # Runs in the request handler so the response carries page_count,
    # boxes, dimensions and mixed-orientation flag without an extra
    # Celery hop. Pikepdf-only (no Ghostscript), typically <100 ms on
    # an 8-page PDF. Network download time dominates.
    if payload.inline_inspect and is_pdf:
        try:
            from app.services.files import Workspace
            from app.services.pdf_ops import pdf_ops
            with Workspace() as ws:
                src = ws.path("probe.pdf")
                storage.download(payload.source_storage_path, src)
                info = pdf_ops.inspect(src)
                asset_repo.update_asset(db, asset_id, {
                    "page_count": info["page_count"],
                    "width_pt": info["width_pt"],
                    "height_pt": info["height_pt"],
                    "boxes": info["boxes"],
                    "status": "normalized",
                })
                inline = {
                    "page_count": info["page_count"],
                    "width_pt": info["width_pt"],
                    "height_pt": info["height_pt"],
                    "boxes": info["boxes"],
                    "mixed_orientation": bool(info.get("mixed_orientation")),
                    "status": "normalized",
                }
        except Exception as exc:
            # Non-fatal — fall through to legacy auto_queue / explicit inspect.
            # The frontend can still POST /assets/{id}/inspect if it wants
            # full metadata. We surface the failure as inline=None.
            import logging
            logging.getLogger(__name__).warning(
                "create_asset: inline probe failed for %s: %s",
                payload.source_storage_path, exc,
            )

    if payload.auto_queue:
        job_id = job_repo.create_job(db, asset_id, "normalize_asset", "documents", {})
        task = normalize_asset.delay(asset_id, job_id)
        job_repo.set_celery_task_id(db, job_id, task.id)
        job_ids.append(job_id)

    return {"asset_id": asset_id, "job_ids": job_ids, "inline_inspect": inline}


@api_router.get("/assets/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    return enrich_asset(asset)


@api_router.get("/assets/{asset_id}/derived-files", response_model=list[DerivedFileResponse])
def list_asset_files(asset_id: str, db: Session = Depends(get_db)):
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")

    files = derived_file_repo.list_for_asset(db, asset_id)
    for item in files:
        item["url"] = storage.public_url(item["storage_path"])
    return files


@api_router.get("/assets/{asset_id}/events")
def list_asset_events(asset_id: str, db: Session = Depends(get_db)):
    """Lightweight progress feed for an in-flight asset.

    Returns a derived snapshot the customer UI can poll while a render is
    running:
      - asset.status, page_count, thumbnail_storage_path
      - per-stage progress (normalize, render) with rendered/total counts
      - the most recent stage message (e.g. "Rendered 47 of 130 pages")

    Best-effort: if the job_events table is missing or temporarily
    unavailable we still return a 200 with an empty event summary so the
    customer upload UI can keep polling and surface backend status.
    """
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")

    rendered = 0
    total = asset.get('page_count') or 0
    latest_message: str | None = None
    latest_stage: str | None = None
    latest_status: str | None = None
    event_count = 0
    try:
        events = job_event_repo.list_for_asset(db, asset_id)
        event_count = len(events)
        for evt in events:
            meta = evt.metadata_json or {}
            if evt.stage in ('render', 'page_batch', 'page'):
                r = int(meta.get('rendered') or meta.get('page') or 0)
                t = int(meta.get('total') or 0)
                if r > rendered:
                    rendered = r
                if t > total:
                    total = t
            latest_message = evt.message or latest_message
            latest_stage = evt.stage
            latest_status = evt.status
    except Exception:
        # Telemetry unavailable — return the asset snapshot anyway so the
        # client can keep polling. Do NOT 500; the upload UI relies on this.
        try:
            db.rollback()
        except Exception:
            pass

    # Surface preview/thumbnail public URLs so the client can prefetch them
    # without needing a second /assets/{id} round-trip.
    return {
        "asset_id": asset_id,
        "status": asset.get("status"),
        "page_count": asset.get("page_count"),
        "rendered_pages": rendered,
        "total_pages": total or asset.get("page_count") or 0,
        "thumbnail_storage_path": asset.get("thumbnail_storage_path"),
        "preview_storage_path": asset.get("preview_storage_path"),
        "thumbnail_url": storage.public_url(asset["thumbnail_storage_path"]) if asset.get("thumbnail_storage_path") else None,
        "preview_url": storage.public_url(asset["preview_storage_path"]) if asset.get("preview_storage_path") else None,
        "latest_stage": latest_stage,
        "latest_status": latest_status,
        "latest_message": latest_message,
        "event_count": event_count,
    }


@api_router.post("/assets/{asset_id}/inspect")
def queue_asset_inspection(
    asset_id: str,
    force: bool = False,
    db: Session = Depends(get_db),
):
    """Queue an inspect job. By default returns cached metadata from the
    asset row when present (page_count + boxes + dimensions). Pass
    ?force=true to re-download and re-parse the PDF."""
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")

    job_id = job_repo.create_job(db, asset_id, "inspect_asset", "default", {"force": force})
    task = inspect_asset.delay(asset_id, job_id, force)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id, "force": force}


@api_router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("select * from jobs where id=:id"), {"id": job_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@api_router.get("/jobs")
def list_jobs(
    limit: int = 100,
    status: str | None = None,
    operation: str | None = None,
    db: Session = Depends(get_db),
):
    sql = "select * from jobs"
    params = {"limit": limit}
    clauses = []

    if status:
        clauses.append("status=:status")
        params["status"] = status
    if operation:
        clauses.append("operation=:operation")
        params["operation"] = operation

    if clauses:
        sql += " where " + " and ".join(clauses)

    sql += " order by created_at desc limit :limit"
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(row) for row in rows]


@api_router.get("/diagnostics")
def diagnostics():
    return get_diagnostics()


@api_router.post("/operations/rotate")
def op_rotate(payload: RotateRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "rotate_pdf", "documents", body)
    task = rotate_pdf.delay(asset_id, job_id, payload.angle)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/grayscale")
def op_grayscale(payload: GrayscaleRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "grayscale_pdf", "documents", body)
    task = grayscale_pdf.delay(asset_id, job_id)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/cmyk")
def op_cmyk(payload: CmykRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "cmyk_pdf", "documents", body)
    task = cmyk_pdf.delay(asset_id, job_id, payload.icc_profile)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/resize")
def op_resize(payload: ResizeRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "resize_pdf", "documents", body)
    task = resize_pdf.delay(
        asset_id,
        job_id,
        payload.width_mm,
        payload.height_mm,
        payload.fit_mode,
        payload.dominant_orientation,
        payload.respect_trim_box,
    )
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/nup")
def op_nup(payload: NupRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "nup_pdf", "imposition", body)
    task = nup_pdf.delay(
        asset_id,
        job_id,
        payload.columns,
        payload.rows,
        payload.page_width_mm,
        payload.page_height_mm,
    )
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/impose-sheet")
def op_impose_sheet(payload: SheetImposeRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "impose_sheet_pdf", "imposition", body)
    task = impose_sheet_pdf.delay(
        asset_id,
        job_id,
        payload.columns,
        payload.rows,
        payload.sheet_width_mm,
        payload.sheet_height_mm,
        payload.bleed_mm,
        payload.gap_mm,
        payload.outer_margin_mm,
        payload.show_crop_marks,
        payload.show_bleed_outline,
	payload.result_upload_url,
    )
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/booklet")
def op_booklet(payload: BookletRequest, db: Session = Depends(get_db)):
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "booklet_pdf", "imposition", body)
    task = booklet_pdf.delay(asset_id, job_id, payload.sheet_width_mm, payload.sheet_height_mm)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/merge")
def op_merge(payload: MergeRequest, db: Session = Depends(get_db)):
    asset_ids = [str(aid) for aid in payload.asset_ids]
    body = {"asset_ids": asset_ids, "output_filename": payload.output_filename}
    job_id = job_repo.create_job(db, None, "merge_pdfs", "documents", body)
    task = merge_pdfs.delay(asset_ids, job_id, payload.output_filename)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/crop-rasterize")
def op_crop_rasterize(payload: CropRasterizeRequest, db: Session = Depends(get_db)):
    """REMOVED — replaced by /operations/generate-previews.

    crop_rasterize ran Ghostscript twice (once per resolution). The
    generate_previews endpoint runs it once and downscales thumbnails with
    PIL — roughly half the wall-clock and identical output. Returning 410
    so any old clients fail loudly instead of silently using the slow path.
    """
    raise HTTPException(
        status_code=410,
        detail="crop_rasterize is retired — use /v1/operations/generate-previews",
    )


@api_router.post("/operations/generate-previews")
def op_generate_previews(payload: GeneratePreviewsRequest, db: Session = Depends(get_db)):
    """Render previews + thumbnails in a single Ghostscript pass.

    Replaces ``/operations/crop-rasterize`` for the customer upload flow:
      * 1 GS invocation (preview DPI) instead of 2
      * Thumbnails downscaled with PIL (LANCZOS) — 20-100x faster
      * Page-1 fast path so the cover thumbnail appears in ~2-3s
      * Parallel S3 uploads for the remaining pages

    Optional ``render_box`` (PDF user-space points) crops the source to the
    target print area before rasterizing — used after a bleed advisory.
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "generate_previews", "thumbnails", body)
    task = generate_previews.delay(asset_id, job_id, payload.render_box)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}

@api_router.post("/operations/convert-office")
def op_convert_office(payload: ConvertOfficeRequest, db: Session = Depends(get_db)):
    """
    Convert an Office source file (doc/docx/ppt/pptx/odt/odp/ods) to PDF and
    promote it to the asset's normalized_storage_path.

    Contract: docs/document-centre-api-contract.md (in the Lovable client repo).
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "convert_office", "documents", body)
    task = convert_office.delay(asset_id, job_id)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/normalize-orientation")
def op_normalize_orientation(payload: NormalizeOrientationRequest, db: Session = Depends(get_db)):
    """
    Rotate any pages whose orientation doesn't match `dominant` (90° CW) and
    promote the resulting PDF to the asset's normalized_storage_path. No-op
    when nothing needs rotating (job result reports skipped=true).

    Contract: docs/document-centre-api-contract.md (in the Lovable client repo).
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "normalize_orientation", "default", body)
    task = normalize_orientation.delay(asset_id, job_id, payload.dominant)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/print-ready")
def op_print_ready(payload: PrintReadyRequest, db: Session = Depends(get_db)):
    """
    Convert a PDF to print-ready CMYK using the supplied ICC destination
    profile and rendering intent. Promotes the result to the asset's
    normalized_storage_path and records the conversion in asset.metadata
    so subsequent calls with the same profile/intent are no-ops.

    When ``chain_generate_previews`` is true, the worker enqueues a
    follow-up generate_previews job as the final step of print_ready
    (preserving the CMYK-first → RGB-thumbnail order strictly). The
    response then includes ``preview_job_id`` so the client polls only
    that downstream job, removing one client↔server round trip from the
    critical path.

    Contract: docs/document-centre-api-contract.md (in the Lovable client repo).
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "print_ready", "documents", body)

    preview_job_id: str | None = None
    if payload.chain_generate_previews:
        # Pre-allocate the downstream preview job row so the response can
        # return its id immediately. The print_ready worker enqueues the
        # actual celery task against this id once the CMYK pass is done.
        preview_job_id = job_repo.create_job(
            db,
            asset_id,
            "generate_previews",
            "thumbnails",
            {
                "render_box": payload.chain_render_box,
                "chained_from_print_ready": str(job_id),
            },
        )

    task = print_ready.delay(
        asset_id,
        job_id,
        payload.intent,
        payload.dest_profile,
        payload.chain_generate_previews,
        payload.chain_render_box,
        preview_job_id,
        payload.dominant_orientation,
    )
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id, "preview_job_id": preview_job_id}


@api_router.post("/assets/{asset_id}/render-pages")
def render_pages(asset_id: str, payload: RenderPagesRequest, db: Session = Depends(get_db)):
    """Surgically re-render one or more pages of an existing asset.

    Body:
      ``{"pages": [2, 7, 11]}``  — explicit list of 1-based page numbers
      ``{"pages": "missing"}``    — auto-detect any page that has no
                                    preview_page or thumbnail_page yet

    Used by the frontend to self-heal after a partial render hiccup,
    instead of re-uploading the source file.
    """
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")

    page_count = asset.get("page_count") or 0
    if not page_count:
        raise HTTPException(409, "Asset has not been inspected yet")

    if payload.pages == "missing":
        present_previews = derived_file_repo.pages_present(db, asset_id, "preview_page")
        present_thumbs = derived_file_repo.pages_present(db, asset_id, "thumbnail_page")
        full = set(range(1, page_count + 1))
        target_pages = sorted(full - (present_previews & present_thumbs))
    else:
        target_pages = sorted({int(p) for p in payload.pages if 1 <= int(p) <= page_count})

    if not target_pages:
        return {"job_id": None, "missing_pages": [], "message": "Nothing to render."}

    body = {"pages": target_pages}
    job_id = job_repo.create_job(db, asset_id, "render_specific_pages", "thumbnails", body)
    task = render_specific_pages.delay(asset_id, job_id, target_pages)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id, "missing_pages": target_pages}


@api_router.post("/operations/prepare-for-product")
def op_prepare_for_product(payload: PrepareForProductRequest, db: Session = Depends(get_db)):
    """One-shot PDF preparation: CMYK → orient → resize.

    Replaces the fragile multi-job client-side sequencing (print-ready →
    normalize-orientation → resize) with a single deterministic pipeline.
    The server performs all mutations in the correct order and promotes one
    final PDF to the asset's normalized_storage_path.

    When ``chain_generate_previews`` is true, the worker enqueues a
    follow-up generate_previews job as the final step (same pattern as
    /operations/print-ready). The response then includes ``preview_job_id``
    so the client polls only the downstream job — one less client↔server
    round-trip and the prepared PDF is handed over the shared on-disk
    cache instead of being re-downloaded from S3.
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "prepare_for_product", "documents", body)

    preview_job_id: str | None = None
    if payload.chain_generate_previews:
        # Pre-allocate the downstream job row so the response can return
        # its id immediately. The prepare_for_product worker enqueues the
        # actual celery task against this id once the prepared PDF is
        # committed.
        preview_job_id = job_repo.create_job(
            db,
            asset_id,
            "generate_previews",
            "thumbnails",
            {
                "render_box": payload.chain_render_box,
                "chained_from_prepare_for_product": str(job_id),
            },
        )

    task = prepare_for_product.delay(
        asset_id,
        job_id,
        payload.dominant_orientation,
        payload.target_width_mm,
        payload.target_height_mm,
        payload.fit_mode,
        payload.dest_profile,
        payload.intent,
        payload.respect_trim_box,
        payload.chain_generate_previews,
        payload.chain_render_box,
        preview_job_id,
    )
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id, "preview_job_id": preview_job_id}


@api_router.post("/operations/pad-pages")
def op_pad_pages(payload: PadPagesRequest, db: Session = Depends(get_db)):
    """Pad a PDF with blank pages so total count is divisible by `multiple`.

    Used for saddle-stitched booklets where each folded sheet has 4 faces.
    Promotes the padded PDF to the asset's normalized_storage_path.
    """
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "pad_pages", "documents", body)
    task = pad_pages_pdf.delay(asset_id, job_id, payload.multiple)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


# ---------------------------------------------------------------------------
# Production pipeline (admin-facing artefacts keyed off order_jobs.id)
# ---------------------------------------------------------------------------
@api_router.post("/operations/assemble-print-ready")
def op_assemble_print_ready(payload: JobArtefactRequest, db: Session = Depends(get_db)):
    """Resolve the order job's documents → ordered → merged print-ready PDF.

    Writes the result path back to ``order_jobs.print_ready_pdf_path`` so the
    admin UI's ProductionPanel can open it directly.
    """
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, None, "assemble_print_ready", "documents", body)
    task = assemble_print_ready_for_job.delay(str(payload.job_id), job_id, bool(payload.force))
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/assemble-imposed-sheet")
def op_assemble_imposed_sheet(payload: JobArtefactRequest, db: Session = Depends(get_db)):
    """Run imposition on the print-ready PDF.

    If `imposition_template_id` is supplied (preferred path), the worker
    overlays customer pages onto the platform-managed press-sheet template.
    Otherwise it falls back to the legacy product-aware nup/booklet/none
    strategy (overridable via ``order_jobs.production_specs.imposition_strategy``).
    """
    body = payload.model_dump(mode="json")

    # Defence in depth: persist the chosen template on the job before kicking
    # off the worker, so the worker reads it from the bundle even if the
    # caller (edge function) raced us.
    if payload.imposition_template_id:
        from app.services.production_orchestrator import write_job_field
        write_job_field(
            str(payload.job_id),
            "imposition_template_id",
            str(payload.imposition_template_id),
        )

    job_id = job_repo.create_job(db, None, "assemble_imposed_sheet", "imposition", body)
    task = assemble_imposed_sheet_for_job.delay(str(payload.job_id), job_id)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post("/operations/render-job-ticket")
def op_render_job_ticket(payload: JobArtefactRequest, db: Session = Depends(get_db)):
    """Render a 1-page A4 operator ticket (header, specs, files, QR, sign-off)."""
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, None, "render_job_ticket", "documents", body)
    task = render_job_ticket_for_job.delay(str(payload.job_id), job_id)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


@api_router.post(
    "/operations/cloudprinter-render",
    response_model=CloudprinterRenderResponse,
    tags=["operations"],
    summary="PMP Cloudprinter render offload",
)
def op_cloudprinter_render(
    payload: CloudprinterRenderRequest,
    authorization: str | None = Header(default=None),
):
    """Queue a Cloudprinter render job for the printmypics (PMP) project.

    Auth: Bearer token matching the ``PMP_CLOUDPRINTER_API_KEY`` env var
    (separate from the main ``API_AUTH_TOKEN`` so PMP can be rotated
    independently of document-centre clients).
    """
    expected = os.getenv("PMP_CLOUDPRINTER_API_KEY", "")
    if not expected:
        raise HTTPException(503, "PMP Cloudprinter integration not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Invalid token")

    task = cloudprinter_render.delay(payload.model_dump(mode="json"))
    return CloudprinterRenderResponse(render_job_id=task.id, status="queued")
