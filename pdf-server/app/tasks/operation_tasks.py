from __future__ import annotations
import traceback
from pathlib import Path
from celery import shared_task
from app.db.session import SessionLocal
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.storage import StorageService
from app.services.files import Workspace, unique_name
from app.services.pdf_ops import pdf_ops
from app.services.derived_files import derived_file_repo

storage = StorageService()

def _db():
    return SessionLocal()

def _tenant_prefix(source_path: str | None) -> str:
    """Extract 'tenants/{id}/' prefix from a storage path, or return ''."""
    if source_path and source_path.startswith("tenants/"):
        parts = source_path.split("/")
        if len(parts) >= 2:
            return f"tenants/{parts[1]}/"
    return ""

def _download_asset_pdf(db, asset_id: str, ws: Workspace) -> Path:
    asset = asset_repo.get_asset(db, asset_id)
    source = asset['normalized_storage_path'] or asset['source_storage_path']
    path = ws.path(f'{asset_id}.pdf')
    storage.download(source, path)
    return path

def _get_asset_prefix(db, asset_id: str) -> str:
    """Get the tenant prefix for an asset's output files."""
    asset = asset_repo.get_asset(db, asset_id)
    return _tenant_prefix(asset.get('source_storage_path'))

def _finalize_pdf_output(db, *, asset_id: str | None, job_id: str, out_pdf: Path, kind: str, prefix: str = '', extra: dict | None = None):
    storage_path = unique_name(f'{prefix}outputs', '.pdf')
    storage.upload(out_pdf, storage_path, 'application/pdf')
    derived_file_repo.create_file(db, asset_id=asset_id, job_id=job_id, kind=kind, storage_path=storage_path, media_type='application/pdf', metadata=extra or {})
    result = {'storage_path': storage_path, **(extra or {})}
    job_repo.mark_done(db, job_id, result)
    return result

@shared_task(bind=True, queue='documents')
def rotate_pdf(self, asset_id: str, job_id: str, angle: int):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('rotated.pdf')
            pdf_ops.rotate(src, out_pdf, angle)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='rotated_pdf', prefix=prefix, extra={'angle': angle})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def grayscale_pdf(self, asset_id: str, job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('grayscale.pdf')
            pdf_ops.grayscale(src, out_pdf)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='grayscale_pdf', prefix=prefix)
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def cmyk_pdf(self, asset_id: str, job_id: str, icc_profile: str | None = None):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('cmyk.pdf')
            pdf_ops.rgb_to_cmyk(src, out_pdf, icc_profile=icc_profile)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='cmyk_pdf', prefix=prefix, extra={'icc_profile': icc_profile})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def resize_pdf(self, asset_id: str, job_id: str, width_mm: float, height_mm: float, fit_mode: str = 'fit'):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('resized.pdf')
            pdf_ops.resize_pages(src, out_pdf, width_mm, height_mm, fit_mode)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='resized_pdf', prefix=prefix, extra={'width_mm': width_mm, 'height_mm': height_mm, 'fit_mode': fit_mode})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='imposition')
def nup_pdf(self, asset_id: str, job_id: str, columns: int, rows: int, page_width_mm: float, page_height_mm: float):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('nup.pdf')
            pdf_ops.nup(src, out_pdf, columns, rows, page_width_mm, page_height_mm)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='nup_pdf', prefix=prefix, extra={'columns': columns, 'rows': rows})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='imposition')
def impose_sheet_pdf(self, asset_id: str, job_id: str, columns: int, rows: int, sheet_width_mm: float, sheet_height_mm: float, bleed_mm: float, gap_mm: float, outer_margin_mm: float, show_crop_marks: bool, show_bleed_outline: bool, result_upload_url: str | None = None):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('sheet-imposed.pdf')
            pdf_ops.impose_sheet_with_bleed(src, out_pdf, columns, rows, sheet_width_mm, sheet_height_mm, bleed_mm, gap_mm, outer_margin_mm, show_crop_marks, show_bleed_outline)

            if result_upload_url:
                import requests as http_requests
                with open(out_pdf, "rb") as f:
                    resp = http_requests.put(result_upload_url, data=f, headers={"Content-Type": "application/pdf"})
                    resp.raise_for_status()

            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='sheet_imposed_pdf', prefix=prefix, extra={'columns': columns, 'rows': rows, 'bleed_mm': bleed_mm})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='imposition')
def booklet_pdf(self, asset_id: str, job_id: str, sheet_width_mm: float, sheet_height_mm: float):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('booklet.pdf')
            pdf_ops.booklet(src, out_pdf, sheet_width_mm, sheet_height_mm)
            return _finalize_pdf_output(db, asset_id=asset_id, job_id=job_id, out_pdf=out_pdf, kind='booklet_pdf', prefix=prefix, extra={'sheet_width_mm': sheet_width_mm, 'sheet_height_mm': sheet_height_mm})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def merge_pdfs(self, asset_ids: list[str], job_id: str, output_filename: str = 'merged.pdf'):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        # Use the first asset's prefix for the merged output
        prefix = _get_asset_prefix(db, asset_ids[0]) if asset_ids else ''
        with Workspace() as ws:
            files = []
            for idx, aid in enumerate(asset_ids):
                src = _download_asset_pdf(db, aid, ws)
                renamed = ws.path(f'{idx:03d}-{aid}.pdf')
                renamed.write_bytes(src.read_bytes())
                files.append(renamed)
            out_pdf = ws.path(output_filename)
            pdf_ops.merge(files, out_pdf)
            return _finalize_pdf_output(db, asset_id=None, job_id=job_id, out_pdf=out_pdf, kind='merged_pdf', prefix=prefix, extra={'asset_ids': asset_ids})
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()


@shared_task(bind=True, queue='thumbnails')
def crop_rasterize(self, asset_id: str, job_id: str, box: list[float], dpi: int = 120):
    from app.core.config import settings
    from PIL import Image
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            cropped = ws.path('cropped.pdf')
            pdf_ops.crop_to_box(src, cropped, box)

            preview_images = pdf_ops.rasterize_preview(cropped, ws.path('preview/page'), dpi=dpi)
            thumb_images = pdf_ops.rasterize_preview(cropped, ws.path('thumb/page'), dpi=max(36, dpi // 3))

            thumb_path = preview_path = None
            for index, image_path in enumerate(preview_images, start=1):
                sp = unique_name(f'{prefix}previews/cropped-page-{index:03d}', '.png')
                storage.upload(image_path, sp, 'image/png')
                w, h = Image.open(image_path).size
                derived_file_repo.create_file(db, asset_id=asset_id, job_id=job_id, kind='cropped_preview_page', storage_path=sp, media_type='image/png', page=index, width=w, height=h, metadata={})
                if index == 1:
                    preview_path = sp

            for index, image_path in enumerate(thumb_images, start=1):
                sp = unique_name(f'{prefix}thumbnails/cropped-page-{index:03d}', '.png')
                storage.upload(image_path, sp, 'image/png')
                w, h = Image.open(image_path).size
                derived_file_repo.create_file(db, asset_id=asset_id, job_id=job_id, kind='cropped_thumbnail_page', storage_path=sp, media_type='image/png', page=index, width=w, height=h, metadata={})
                if index == 1:
                    thumb_path = sp

            from app.services.assets import asset_repo as ar
            ar.update_asset(db, asset_id, {'thumbnail_storage_path': thumb_path, 'preview_storage_path': preview_path, 'status': 'ready'})
            result = {'thumbnail_storage_path': thumb_path, 'preview_storage_path': preview_path, 'pages_rendered': len(preview_images)}
            job_repo.mark_done(db, job_id, result)
            return result
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()
