from __future__ import annotations
import logging
logger = logging.getLogger(__name__)
import traceback
from PIL import Image
from sqlalchemy.orm import Session
from celery import shared_task
from app.db.session import SessionLocal
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.storage import StorageService
from app.services.files import Workspace, unique_name
from app.services.pdf_ops import pdf_ops
from app.services.derived_files import derived_file_repo
from app.core.config import settings

storage = StorageService()

def _db() -> Session:
    return SessionLocal()


def _tenant_prefix(source_path: str | None) -> str:
    """Extract 'tenants/{id}/' prefix from source_storage_path, or return ''."""
    if source_path and source_path.startswith("tenants/"):
        parts = source_path.split("/")
        if len(parts) >= 2:
            return f"tenants/{parts[1]}/"
    return ""


def _record_preview(db: Session, asset_id: str, job_id: str, kind: str, storage_path: str, image_path, page: int | None = None, size_label: str | None = None):
    width = height = None
    with Image.open(image_path) as im:
        width, height = im.size
    derived_file_repo.create_file(
        db,
        asset_id=asset_id,
        job_id=job_id,
        kind=kind,
        storage_path=storage_path,
        media_type='image/png',
        page=page,
        width=width,
        height=height,
        metadata={'size': size_label} if size_label else {},
    )

@shared_task(bind=True, queue='documents')
def normalize_asset(self, asset_id: str, job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        prefix = _tenant_prefix(asset.get('source_storage_path'))
        with Workspace() as ws:
            src = ws.path(asset['original_filename'])
            source_url = asset.get('metadata', {}).get('source_url') if isinstance(asset.get('metadata'), dict) else None
            if source_url:
                import httpx
                logger.info(f"Downloading from source_url: {source_url[:80]}...")
                resp = httpx.get(source_url, follow_redirects=True, timeout=120)
                resp.raise_for_status()
                with open(src, 'wb') as f:
                    f.write(resp.content)
            else:
                storage.download(asset['source_storage_path'], src)
            ext = src.suffix.lower()
            normalized = ws.path('normalized.pdf')
            if asset['media_type'] == 'application/pdf' or ext == '.pdf':
                pdf_ops.normalize_pdf(src, normalized)
            elif ext in {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp'}:
                normalized = pdf_ops.image_to_pdf(src, normalized)
            elif ext in {'.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.rtf'}:
                normalized = pdf_ops.office_to_pdf(src, ws.root)
            else:
                raise ValueError(f'Unsupported file type: {ext}')
            info = pdf_ops.inspect(normalized)
            storage_path = unique_name(f'{prefix}normalized', '.pdf')
            storage.upload(normalized, storage_path, 'application/pdf')
            derived_file_repo.create_file(db, asset_id=asset_id, job_id=job_id, kind='normalized_pdf', storage_path=storage_path, media_type='application/pdf', metadata={'page_count': info['page_count']})
            asset_repo.update_asset(db, asset_id, {
                'status': 'normalized',
                'normalized_storage_path': storage_path,
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'boxes': info['boxes'],
            })
            job_repo.mark_done(db, job_id, {'normalized_storage_path': storage_path, **info})
            inspect_job_id = job_repo.create_job(db, asset_id, 'inspect_asset', 'documents', {})
            inspect_task = inspect_asset.delay(asset_id, inspect_job_id)
            job_repo.set_celery_task_id(db, inspect_job_id, inspect_task.id)
            preview_job_id = job_repo.create_job(db, asset_id, 'generate_previews', 'thumbnails', {})
            task = generate_previews.delay(asset_id, preview_job_id)
            job_repo.set_celery_task_id(db, preview_job_id, task.id)
            return {'asset_id': asset_id, 'normalized_storage_path': storage_path, 'preview_job_id': preview_job_id, 'inspect_job_id': inspect_job_id}
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def inspect_asset(self, asset_id: str, job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        with Workspace() as ws:
            src = ws.path('inspect.pdf')
            storage.download(src_path, src)
            info = pdf_ops.inspect(src)
            asset_repo.update_asset(db, asset_id, {
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'boxes': info['boxes'],
                'status': asset.get('status') or 'normalized',
            })
            job_repo.mark_done(db, job_id, info)
            return info
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='thumbnails')
def generate_previews(self, asset_id: str, job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        prefix = _tenant_prefix(asset.get('source_storage_path'))
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        with Workspace() as ws:
            src = ws.path('input.pdf')
            storage.download(src_path, src)
            preview_images = pdf_ops.rasterize_preview(src, ws.path('preview/page'), dpi=settings.preview_dpi)
            thumb_images = pdf_ops.rasterize_preview(src, ws.path('thumb/page'), dpi=settings.thumbnail_dpi)
            thumb_path = None
            preview_path = None
            files_created = []
            for index, image_path in enumerate(preview_images, start=1):
                storage_path = unique_name(f'{prefix}previews/page-{index:03d}', '.png')
                storage.upload(image_path, storage_path, 'image/png')
                _record_preview(db, asset_id, job_id, 'preview_page', storage_path, image_path, page=index, size_label='preview')
                files_created.append({'kind': 'preview_page', 'page': index, 'storage_path': storage_path})
                if index == 1:
                    preview_path = storage_path
            for index, image_path in enumerate(thumb_images, start=1):
                storage_path = unique_name(f'{prefix}thumbnails/page-{index:03d}', '.png')
                storage.upload(image_path, storage_path, 'image/png')
                _record_preview(db, asset_id, job_id, 'thumbnail_page', storage_path, image_path, page=index, size_label='thumbnail')
                files_created.append({'kind': 'thumbnail_page', 'page': index, 'storage_path': storage_path})
                if index == 1:
                    thumb_path = storage_path
            asset_repo.update_asset(db, asset_id, {'thumbnail_storage_path': thumb_path, 'preview_storage_path': preview_path, 'status': 'ready'})
            job_repo.mark_done(db, job_id, {'thumbnail_storage_path': thumb_path, 'preview_storage_path': preview_path, 'pages_rendered': len(preview_images), 'files_created': files_created[:20]})
            return {'pages_rendered': len(preview_images)}
    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

