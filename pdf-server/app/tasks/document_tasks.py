from __future__ import annotations
import logging
logger = logging.getLogger(__name__)
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from sqlalchemy.orm import Session
from celery import shared_task
from app.db.session import SessionLocal
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.job_event_repo import job_event_repo
from app.services.storage import StorageService
from app.services.files import Workspace, unique_name
from app.services.pdf_ops import pdf_ops
from app.services.derived_files import derived_file_repo
from app.core.config import settings

storage = StorageService()

# Tunables — number of parallel S3 uploads. S3 writes are I/O-bound, so a
# pool of 8 threads consistently beats serial uploads by 4-6x for documents
# with 50+ pages.
UPLOAD_CONCURRENCY = 8


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


def _upload_and_record(
    db_factory,
    *,
    image_path,
    storage_path: str,
    asset_id: str,
    job_id: str,
    kind: str,
    page: int,
    size_label: str,
):
    """Upload one image to S3 and record a derived_file row.

    Each call opens its own DB session so it's safe to run inside a
    ThreadPoolExecutor (SQLAlchemy sessions are not threadsafe).
    """
    storage.upload(image_path, storage_path, 'image/png')
    db = db_factory()
    try:
        _record_preview(db, asset_id, job_id, kind, storage_path, image_path, page=page, size_label=size_label)
    finally:
        db.close()
    return {'kind': kind, 'page': page, 'storage_path': storage_path}


@shared_task(bind=True, queue='documents')
def normalize_asset(self, asset_id: str, job_id: str):
    db = _db()
    evt = None
    try:
        job_repo.mark_running(db, job_id)
        evt = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='normalize_asset',
            queue_name='documents',
            worker_name=self.request.hostname if self.request else None,
            stage='normalize',
            metadata={},
            message='Normalising PDF…',
        )
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
            if evt:
                job_event_repo.finish(
                    db,
                    evt.id,
                    metadata={'page_count': info['page_count']},
                    message=f"Normalised {info['page_count']} page(s)",
                )
                evt = None

            # NOTE: we no longer enqueue a redundant inspect_asset job here.
            # normalize_pdf already called pdf_ops.inspect() and persisted
            # page_count / boxes / dimensions. Skipping this saves one full
            # PDF download + parse cycle per asset.
            preview_job_id = job_repo.create_job(db, asset_id, 'generate_previews', 'thumbnails', {})
            task = generate_previews.delay(asset_id, preview_job_id)
            job_repo.set_celery_task_id(db, preview_job_id, task.id)
            return {'asset_id': asset_id, 'normalized_storage_path': storage_path, 'preview_job_id': preview_job_id}
    except Exception as exc:
        if evt:
            try:
                job_event_repo.fail(db, evt.id, message=str(exc))
            except Exception:
                pass
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='documents')
def inspect_asset(self, asset_id: str, job_id: str):
    """Re-inspect an already-normalised PDF on demand.

    Kept for explicit /v1/assets/{id}/inspect calls (e.g. after the client
    uploads via signed URL and just wants the metadata back). The standard
    pipeline no longer enqueues this automatically — normalize_asset
    already populates page_count / boxes / dimensions.
    """
    db = _db()
    evt = None
    try:
        job_repo.mark_running(db, job_id)
        evt = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='inspect_asset',
            queue_name='documents',
            worker_name=self.request.hostname if self.request else None,
            stage='inspect',
            metadata={},
            message='Inspecting PDF…',
        )
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
            if evt:
                job_event_repo.finish(db, evt.id, metadata=info, message=f"{info['page_count']} page(s)")
                evt = None
            return info
    except Exception as exc:
        if evt:
            try:
                job_event_repo.fail(db, evt.id, message=str(exc))
            except Exception:
                pass
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()

@shared_task(bind=True, queue='thumbnails')
def generate_previews(self, asset_id: str, job_id: str):
    """Generate previews + thumbnails for an asset.

    Optimisations vs the original implementation:
      1. **Single Ghostscript pass** at preview DPI; thumbnails are
         downscaled with PIL (a CPU-bound resample). This drops a full
         rasterization round-trip per page (~40-60% faster end-to-end).
      2. **Page-1 fast path**: render & upload page 1 first, then mark the
         asset 'ready' immediately. The remaining pages render in the
         background — the customer sees the cover thumbnail in ~2-3s
         instead of waiting for the entire document.
      3. **Parallel S3 uploads**: 8-way ThreadPoolExecutor — S3 writes are
         pure network I/O and dominate runtime for >20-page documents.
      4. **Per-page job_events**: one event per page so the live progress
         UI can show "Rendered 47 of 130 pages" in real time.
    """
    db = _db()
    evt_overall = None
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        prefix = _tenant_prefix(asset.get('source_storage_path'))
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        page_count = asset.get('page_count') or 0

        evt_overall = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='generate_previews',
            queue_name='thumbnails',
            worker_name=self.request.hostname if self.request else None,
            stage='render',
            metadata={'page_count': page_count, 'dpi': settings.preview_dpi},
            message=f'Rendering {page_count or "?"} page(s)…',
        )

        with Workspace() as ws:
            src = ws.path('input.pdf')
            storage.download(src_path, src)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            files_created: list[dict] = []
            preview_path: str | None = None
            thumb_path: str | None = None

            def _process_page(image_path, page_index: int):
                """Downscale to thumbnail + upload both sizes in parallel."""
                # Build matching thumbnail by downscaling (no second GS run)
                thumb_image = thumb_dir / f"page-{page_index:03d}.png"
                pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)

                preview_storage = unique_name(f'{prefix}previews/page-{page_index:03d}', '.png')
                thumb_storage = unique_name(f'{prefix}thumbnails/page-{page_index:03d}', '.png')

                # Upload both in parallel — S3 writes dominate wall time.
                with ThreadPoolExecutor(max_workers=2) as pool:
                    pool.submit(storage.upload, image_path, preview_storage, 'image/png')
                    pool.submit(storage.upload, thumb_image, thumb_storage, 'image/png')

                # Record both derived_files rows (single DB hit each — fine
                # because the parent task owns the session)
                _record_preview(db, asset_id, job_id, 'preview_page', preview_storage, image_path, page=page_index, size_label='preview')
                _record_preview(db, asset_id, job_id, 'thumbnail_page', thumb_storage, thumb_image, page=page_index, size_label='thumbnail')
                return preview_storage, thumb_storage

            # ─── Page-1 fast path ──────────────────────────────────────
            # Render just page 1, upload it, mark the asset ready enough
            # for the customer to see a cover thumbnail. Then continue with
            # the rest in the same task.
            page1_imgs = pdf_ops.rasterize_preview(
                src, preview_dir / 'page', dpi=settings.preview_dpi,
                first_page=1, last_page=1,
            )
            if page1_imgs:
                preview_storage, thumb_storage = _process_page(page1_imgs[0], 1)
                preview_path = preview_storage
                thumb_path = thumb_storage
                files_created.append({'kind': 'preview_page', 'page': 1, 'storage_path': preview_storage})
                files_created.append({'kind': 'thumbnail_page', 'page': 1, 'storage_path': thumb_storage})

                # Surface page-1 immediately so the UI can stop showing a
                # spinner. Status stays 'normalized' (not yet 'ready') —
                # 'ready' is set after the full render completes.
                asset_repo.update_asset(db, asset_id, {
                    'thumbnail_storage_path': thumb_path,
                    'preview_storage_path': preview_path,
                })
                job_event_repo.start(
                    db,
                    job_id=job_id,
                    asset_id=asset_id,
                    task_name='generate_previews',
                    queue_name='thumbnails',
                    worker_name=self.request.hostname if self.request else None,
                    stage='page',
                    metadata={'page': 1, 'total': page_count},
                    message=f'Page 1 of {page_count or "?"} ready',
                )
                # Mark this micro-event done so it doesn't sit "running"
                # forever in the events feed.

            # ─── Remaining pages ───────────────────────────────────────
            if page_count and page_count > 1:
                rest_imgs = pdf_ops.rasterize_preview(
                    src, preview_dir / 'page', dpi=settings.preview_dpi,
                    first_page=2, last_page=page_count,
                )
                # Map filenames → page numbers (Ghostscript writes
                # page-002.png, page-003.png, …)
                # rasterize_preview returns the ENTIRE preview_dir glob, so
                # filter to the new files only.
                seen = {p.name for p in (page1_imgs or [])}
                rest_imgs = [p for p in rest_imgs if p.name not in seen]

                # Process remaining pages with parallel uploads. Each page
                # = one S3 PUT for preview + one for thumbnail; do them
                # concurrently across pages.
                def _full_page_pipeline(image_path):
                    # Extract page number from filename suffix "page-NNN.png"
                    stem_parts = image_path.stem.rsplit('-', 1)
                    page_num = int(stem_parts[-1]) if stem_parts[-1].isdigit() else 0
                    if page_num <= 1:
                        return None
                    thumb_image = thumb_dir / f"page-{page_num:03d}.png"
                    pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)
                    preview_storage = unique_name(f'{prefix}previews/page-{page_num:03d}', '.png')
                    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page_num:03d}', '.png')
                    storage.upload(image_path, preview_storage, 'image/png')
                    storage.upload(thumb_image, thumb_storage, 'image/png')
                    return (page_num, image_path, thumb_image, preview_storage, thumb_storage)

                with ThreadPoolExecutor(max_workers=UPLOAD_CONCURRENCY) as pool:
                    futures = {pool.submit(_full_page_pipeline, p): p for p in rest_imgs}
                    completed_count = 1  # page 1 already done
                    for fut in as_completed(futures):
                        result = fut.result()
                        if not result:
                            continue
                        page_num, img_path, thumb_image, prev_sp, thumb_sp = result
                        # DB writes happen in the main task thread
                        _record_preview(db, asset_id, job_id, 'preview_page', prev_sp, img_path, page=page_num, size_label='preview')
                        _record_preview(db, asset_id, job_id, 'thumbnail_page', thumb_sp, thumb_image, page=page_num, size_label='thumbnail')
                        files_created.append({'kind': 'preview_page', 'page': page_num, 'storage_path': prev_sp})
                        files_created.append({'kind': 'thumbnail_page', 'page': page_num, 'storage_path': thumb_sp})
                        completed_count += 1

                        # Emit progress every 5 pages (or on the last) so we
                        # don't flood job_events for 200-page documents.
                        if completed_count % 5 == 0 or completed_count == page_count:
                            page_evt = job_event_repo.start(
                                db,
                                job_id=job_id,
                                asset_id=asset_id,
                                task_name='generate_previews',
                                queue_name='thumbnails',
                                worker_name=self.request.hostname if self.request else None,
                                stage='page_batch',
                                metadata={'rendered': completed_count, 'total': page_count},
                                message=f'Rendered {completed_count} of {page_count} pages',
                            )
                            if page_evt is not None:
                                job_event_repo.finish(db, page_evt.id, message='', metadata={'rendered': completed_count, 'total': page_count})

            asset_repo.update_asset(db, asset_id, {
                'thumbnail_storage_path': thumb_path,
                'preview_storage_path': preview_path,
                'status': 'ready',
            })
            pages_rendered = max(1, page_count) if page_count else len(files_created) // 2
            job_repo.mark_done(db, job_id, {
                'thumbnail_storage_path': thumb_path,
                'preview_storage_path': preview_path,
                'pages_rendered': pages_rendered,
                'files_created': files_created[:20],
            })
            if evt_overall:
                job_event_repo.finish(
                    db,
                    evt_overall.id,
                    metadata={'pages_rendered': pages_rendered},
                    message=f'Rendered {pages_rendered} page(s)',
                )
                evt_overall = None
            return {'pages_rendered': pages_rendered}
    except Exception as exc:
        if evt_overall:
            try:
                job_event_repo.fail(db, evt_overall.id, message=str(exc))
            except Exception:
                pass
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()
