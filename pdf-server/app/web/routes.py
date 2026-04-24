from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db
from app.schemas.assets import (
    CropRasterizeRequest,
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
)
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.storage import StorageService
from app.services.derived_files import derived_file_repo
from app.services.diagnostics import get_diagnostics
from app.tasks.document_tasks import normalize_asset, inspect_asset
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
)

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
    asset_id = asset_repo.create_asset(db, payload.model_dump(exclude={"auto_queue"}))
    job_ids: list[str] = []

    if payload.auto_queue:
        job_id = job_repo.create_job(db, asset_id, "normalize_asset", "documents", {})
        task = normalize_asset.delay(asset_id, job_id)
        job_repo.set_celery_task_id(db, job_id, task.id)
        job_ids.append(job_id)

    return {"asset_id": asset_id, "job_ids": job_ids}


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


@api_router.post("/assets/{asset_id}/inspect")
def queue_asset_inspection(asset_id: str, db: Session = Depends(get_db)):
    asset = asset_repo.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")

    job_id = job_repo.create_job(db, asset_id, "inspect_asset", "documents", {})
    task = inspect_asset.delay(asset_id, job_id)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}


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
    task = resize_pdf.delay(asset_id, job_id, payload.width_mm, payload.height_mm, payload.fit_mode)
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
    asset_id = str(payload.asset_id)
    body = payload.model_dump(mode="json")
    job_id = job_repo.create_job(db, asset_id, "crop_rasterize", "thumbnails", body)
    task = crop_rasterize.delay(asset_id, job_id, payload.box, payload.dpi)
    job_repo.set_celery_task_id(db, job_id, task.id)
    return {"job_id": job_id}
