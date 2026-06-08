from __future__ import annotations
import logging
import os
import shutil
logger = logging.getLogger(__name__)
import random
import time
import traceback
from pathlib import Path
from concurrent.futures import (
    ProcessPoolExecutor,
    ThreadPoolExecutor,
    TimeoutError as FuturesTimeoutError,
    as_completed,
)
from PIL import Image
from sqlalchemy import text
from sqlalchemy.orm import Session
from celery import shared_task
from app.db.session import SessionLocal
from app.services.assets import asset_repo
from app.services.jobs import job_repo
from app.services.job_event_repo import job_event_repo
from app.services.storage import StorageService
from app.services.files import Workspace, unique_name, cache_get
from app.services.pdf_ops import (
    pdf_ops,
    RasterizationIncompleteError,
    MutoolRenderError,
    mutool_effective_format,
    mutool_threading_supported,
    extract_single_image_page,
)
from app.services.derived_files import derived_file_repo
from app.core.config import settings
from app.core.queue import enqueue
from app.core.task_errors import NonRetryableTaskError


storage = StorageService()

# Tunables — see app.core.config. CPU pool runs Ghostscript + Pillow
# downscale; IO pool runs S3 upload + DB write. Streaming CPU → IO lets
# the next page rasterise while the previous page uploads, which is the
# big win on a multi-vCPU box.
UPLOAD_CONCURRENCY = settings.render_io_concurrency  # backwards-compat alias

# When True, generate_previews fans the per-page work out to other Celery
# workers instead of using an in-process thread pool. This lets a single
# upload soak up ALL light-queue children (default 4) instead of being
# pinned to one. See render_one_page subtask + the fan-out section in
# generate_previews. Set RENDER_FANOUT_ENABLED=false in .env to revert.
FANOUT_ENABLED = settings.render_fanout_enabled



def _db() -> Session:
    return SessionLocal()


def _runtime_meta() -> dict:
    """Non-secret runtime facts for embedding in job_events.metadata so the
    admin asset inspector can prove which Cloud Run revision / worker /
    queue backend handled a render without trawling logs."""
    from app.core.config import settings as _s
    try:
        thread_ok = mutool_threading_supported()
    except Exception:
        thread_ok = None
    try:
        eff_fmt, eff_ext = mutool_effective_format(_s.preview_format)
    except Exception:
        eff_fmt, eff_ext = (None, None)
    return {
        'k_service': os.getenv('K_SERVICE'),
        'k_revision': os.getenv('K_REVISION'),
        'k_configuration': os.getenv('K_CONFIGURATION'),
        'role': os.getenv('ROLE'),
        'queue_backend': os.getenv('QUEUE_BACKEND', 'celery'),
        'gcp_region': os.getenv('GCP_REGION'),
        'gcp_tasks_region': os.getenv('GCP_TASKS_REGION'),
        'cpu_count': os.cpu_count(),
        'mutool_threads': getattr(_s, 'mutool_render_threads', None),
        'mutool_band_height': getattr(_s, 'mutool_band_height', None),
        'mutool_threading_supported': thread_ok,
        'mutool_effective_format': eff_fmt,
        'mutool_effective_ext': eff_ext,
        'render_cpu_concurrency': getattr(_s, 'render_cpu_concurrency', None),
        'render_io_concurrency': getattr(_s, 'render_io_concurrency', None),
        'preview_renderer': getattr(_s, 'preview_renderer', None),
        'preview_gs_threads': getattr(_s, 'preview_gs_threads', None),
        'preview_gs_batch_timeout_seconds': getattr(_s, 'preview_gs_batch_timeout_seconds', None),
        'preview_gs_page_timeout_seconds': getattr(_s, 'preview_gs_page_timeout_seconds', None),
        'preview_render_box_mode': getattr(_s, 'preview_render_box_mode', None),
        'preview_mutool_salvage_enabled': getattr(_s, 'preview_mutool_salvage_enabled', None),
    }


def _tenant_prefix(source_path: str | None) -> str:
    """Extract 'tenants/{id}/' prefix from source_storage_path, or return ''."""
    if source_path and source_path.startswith("tenants/"):
        parts = source_path.split("/")
        if len(parts) >= 2:
            return f"tenants/{parts[1]}/"
    return ""



def _download_pdf_with_cache(storage_path: str, local_path, *, asset_id: str, timings: dict[str, int] | None = None) -> None:
    """Materialise a PDF for rendering, preferring the shared handoff cache."""
    t0 = time.monotonic()
    cached = cache_get(storage_path)
    if cached is not None:
        try:
            shutil.copyfile(cached, local_path)
            if timings is not None:
                timings['cache_copy_pdf'] = int((time.monotonic() - t0) * 1000)
            logger.info('pdf_cache: hit asset=%s key=%s', asset_id, storage_path)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning('pdf_cache: copy failed asset=%s key=%s err=%s; falling back to S3', asset_id, storage_path, exc)

    storage.download(storage_path, local_path)
    if timings is not None:
        timings['s3_download_pdf'] = int((time.monotonic() - t0) * 1000)


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
            logger.info(
                "normalize_asset: asset=%s expected_pages=%s media_type=%s",
                asset_id, info.get('page_count'), asset.get('media_type'),
            )
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
            # Honour the PDF's own TrimBox/BleedBox so previews show the
            # finished page edge (no bleed margin / crop marks).
            try:
                default_render_box = pdf_ops.derive_default_render_box(normalized)
            except Exception:
                default_render_box = None
            preview_job_id = job_repo.create_job(
                db, asset_id, 'generate_previews', 'thumbnails',
                {'render_box': default_render_box} if default_render_box else {},
            )
            task_id = enqueue("generate_previews", asset_id, preview_job_id, default_render_box, queue="thumbnails")
            job_repo.set_celery_task_id(db, preview_job_id, task_id)
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

@shared_task(bind=True, queue='default')
def inspect_asset(self, asset_id: str, job_id: str, force: bool = False):
    """Re-inspect an already-normalised PDF on demand.

    Fast path: if the asset row already has page_count + boxes from
    normalize_asset, return them without re-downloading the PDF. Pass
    force=True (or POST /inspect?force=true) to bypass the cache.
    """
    db = _db()
    evt = None
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        cached_ok = (
            not force
            and asset.get('page_count')
            and asset.get('boxes')
            and asset.get('width_pt')
            and asset.get('height_pt')
        )

        evt = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='inspect_asset',
            queue_name='documents',
            worker_name=self.request.hostname if self.request else None,
            stage='inspect',
            metadata={'cached': bool(cached_ok)},
            message='Returning cached metadata' if cached_ok else 'Inspecting PDF…',
        )

        if cached_ok:
            info = {
                'page_count': asset['page_count'],
                'width_pt': asset['width_pt'],
                'height_pt': asset['height_pt'],
                'boxes': asset['boxes'],
            }
            job_repo.mark_done(db, job_id, info)
            if evt:
                job_event_repo.finish(db, evt.id, metadata=info, message=f"{info['page_count']} page(s) (cached)")
                evt = None
            return info

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

# ---------------------------------------------------------------------------
# Per-page pipeline helpers (used by generate_previews + render_specific_pages)
# ---------------------------------------------------------------------------


def _retry_with_backoff(fn, *, label: str, page: int):
    """Run ``fn()`` with bounded retries and exponential backoff + jitter.

    Returns the function's result on success. Raises the last exception if
    every attempt fails.
    """
    max_retries = max(1, settings.preview_page_max_retries)
    base_ms = max(50, settings.preview_page_retry_base_ms)
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — we re-raise after exhausting
            last_exc = exc
            logger.warning(
                "%s: attempt %d/%d failed for page %d: %s",
                label, attempt, max_retries, page, exc,
            )
            if attempt == max_retries:
                break
            delay = (base_ms * (2 ** (attempt - 1))) / 1000.0
            time.sleep(delay + random.uniform(0, delay * 0.25))
    assert last_exc is not None
    raise last_exc


def _render_one_page(
    *,
    src_pdf,
    preview_dir,
    thumb_dir,
    prefix: str,
    page: int,
    dpi: int,
):
    """Rasterize → downscale → upload preview + thumbnail for one page.

    Prefers MuPDF (JPEG) — it is materially faster than Ghostscript for
    "PDF page → pixels". Falls back to single-page Ghostscript PNG only
    if MuPDF genuinely cannot render the page.

    Returns ``(image_path, thumb_image, preview_storage, thumb_storage,
    preview_ext, preview_media_type)``.
    """
    page_preview_dir = preview_dir / f"p{page:03d}"
    page_thumb_dir = thumb_dir / f"p{page:03d}"
    page_preview_dir.mkdir(parents=True, exist_ok=True)
    page_thumb_dir.mkdir(parents=True, exist_ok=True)
    out_prefix = page_preview_dir / 'page'

    image_path, preview_ext, preview_media_type = _retry_with_backoff(
        lambda: _rasterize_one_page_best_effort(
            src_pdf=src_pdf, out_prefix=out_prefix, page=page, dpi=dpi,
        ),
        label='rasterize_one_page', page=page,
    )

    def _do_downscale():
        thumb_image = page_thumb_dir / f"page-{page:03d}.png"
        pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)
        return thumb_image

    thumb_image = _retry_with_backoff(
        _do_downscale, label='downscale_thumbnail', page=page,
    )

    preview_storage = unique_name(f'{prefix}previews/page-{page:03d}', f'.{preview_ext}')
    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page:03d}', '.png')

    _retry_with_backoff(
        lambda: storage.upload(image_path, preview_storage, preview_media_type),
        label='upload_preview', page=page,
    )
    _retry_with_backoff(
        lambda: storage.upload(thumb_image, thumb_storage, 'image/png'),
        label='upload_thumbnail', page=page,
    )

    return image_path, thumb_image, preview_storage, thumb_storage, preview_ext, preview_media_type


def _rasterize_one_page_best_effort(
    *,
    src_pdf,
    out_prefix,
    page: int,
    dpi: int,
):
    """Single-page rasterise honouring ``settings.preview_renderer``.

    Default ('ghostscript'): render PDF → JPEG in one `gs` call. Falls
    back to MuPDF JPEG, then to Ghostscript PNG as a last resort.
    Legacy ('mutool'): preserve the previous MuPDF-first behaviour.
    Returns ``(image_path, ext, media_type)``.
    """
    from app.core.config import settings as _s
    renderer = (getattr(_s, "preview_renderer", "ghostscript") or "ghostscript").lower()

    def _try_gs_jpeg():
        produced = pdf_ops.rasterize_one_page_ghostscript_jpeg(
            src_pdf, out_prefix, dpi=dpi, page=page,
            quality=_s.preview_jpeg_quality,
        )
        return produced, "jpg", "image/jpeg"

    def _try_mutool():
        produced = pdf_ops.rasterize_one_page_mutool(
            src_pdf, out_prefix, dpi=dpi, page=page, fmt=_s.preview_format,
            timeout_seconds=float(getattr(_s, "preview_gs_page_timeout_seconds", 20) or 20),
        )
        _fmt, ext = mutool_effective_format(_s.preview_format)
        media_type = 'image/jpeg' if ext == 'jpg' else 'image/png'
        return produced, ext, media_type

    def _try_gs_png():
        pdf_ops.rasterize_preview(
            src_pdf, out_prefix, dpi=dpi, first_page=page, last_page=page,
        )
        target = out_prefix.parent / f"page-{page:03d}.png"
        if not target.exists():
            raise RuntimeError(f"rasterize fallback produced no file for page {page}")
        return target, 'png', 'image/png'

    if renderer == "mutool":
        chain = [_try_mutool, _try_gs_jpeg, _try_gs_png]
    else:
        chain = [_try_gs_jpeg, _try_mutool, _try_gs_png]

    last_exc: Exception | None = None
    for attempt in chain:
        try:
            return attempt()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "rasterize_one_page: %s failed for page %d (%s) — trying next renderer",
                attempt.__name__, page, exc,
            )
            last_exc = exc
    assert last_exc is not None
    raise last_exc



# ---------------------------------------------------------------------------
# Two-pool variants: CPU phase (rasterize + downscale) and IO phase
# (upload + DB write). Used by generate_previews + the salvage loop so the
# CPU pool stays small (cpu_count-1) while the IO pool can fan out wider.
# ---------------------------------------------------------------------------


def _render_page_cpu(
    *,
    src_pdf,
    preview_dir,
    thumb_dir,
    page: int,
    dpi: int,
):
    """CPU-bound phase: rasterize PDF page + downscale to thumbnail.

    Prefers MuPDF (JPEG) — falls back to Ghostscript PNG only if MuPDF
    cannot render this specific page. Using GS as the default per-page
    path was the cause of the observed "24-page crawl": GS is several
    times slower than MuPDF for "PDF page → pixels".

    Returns (image_path, thumb_image, preview_ext, preview_media_type).
    """
    page_preview_dir = preview_dir / f"p{page:03d}"
    page_thumb_dir = thumb_dir / f"p{page:03d}"
    page_preview_dir.mkdir(parents=True, exist_ok=True)
    page_thumb_dir.mkdir(parents=True, exist_ok=True)
    out_prefix = page_preview_dir / 'page'

    image_path, preview_ext, preview_media_type = _retry_with_backoff(
        lambda: _rasterize_one_page_best_effort(
            src_pdf=src_pdf, out_prefix=out_prefix, page=page, dpi=dpi,
        ),
        label='rasterize_one_page', page=page,
    )

    def _do_downscale():
        thumb_image = page_thumb_dir / f"page-{page:03d}.png"
        pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)
        return thumb_image

    thumb_image = _retry_with_backoff(
        _do_downscale, label='downscale_thumbnail', page=page,
    )
    return image_path, thumb_image, preview_ext, preview_media_type



def _upload_page_io(
    *,
    prefix: str,
    page: int,
    image_path,
    thumb_image,
    preview_ext: str = 'png',
    preview_media_type: str = 'image/png',
):
    """IO-bound phase: upload preview + thumbnail to S3.

    Returns (preview_storage, thumb_storage). DB writes happen in the
    main thread after this returns so we don't fight SQLAlchemy session
    threadsafety rules.
    """
    preview_storage = unique_name(f'{prefix}previews/page-{page:03d}', f'.{preview_ext}')
    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page:03d}', '.png')

    _retry_with_backoff(
        lambda: storage.upload(image_path, preview_storage, preview_media_type),
        label='upload_preview', page=page,
    )
    _retry_with_backoff(
        lambda: storage.upload(thumb_image, thumb_storage, 'image/png'),
        label='upload_thumbnail', page=page,
    )
    return preview_storage, thumb_storage



def _record_page(
    db,
    *,
    asset_id: str,
    job_id: str,
    page: int,
    image_path,
    thumb_image,
    preview_storage: str,
    thumb_storage: str,
    preview_media_type: str = 'image/png',
):
    """Idempotently record both derived_files rows for a page in ONE
    bulk upsert. Replaces two separate select+update+commit cycles per
    page (the per-page DB bottleneck observed on Cloud Run)."""
    prev_w = prev_h = thumb_w = thumb_h = None
    try:
        with Image.open(image_path) as im:
            prev_w, prev_h = im.size
    except Exception:
        pass
    try:
        with Image.open(thumb_image) as im:
            thumb_w, thumb_h = im.size
    except Exception:
        pass
    _retry_with_backoff(
        lambda: derived_file_repo.bulk_upsert_page_files(
            db, asset_id=asset_id, job_id=job_id, rows=[
                {
                    'kind': 'preview_page',
                    'storage_path': preview_storage,
                    'media_type': preview_media_type,
                    'page': page,
                    'width': prev_w,
                    'height': prev_h,
                    'metadata': {'size': 'preview'},
                },
                {
                    'kind': 'thumbnail_page',
                    'storage_path': thumb_storage,
                    'media_type': 'image/png',
                    'page': page,
                    'width': thumb_w,
                    'height': thumb_h,
                    'metadata': {'size': 'thumbnail'},
                },
            ],
        ),
        label='db_bulk_record_page', page=page,
    )


def _record_page_sequential(
    db,
    *,
    asset_id: str,
    job_id: str,
    page: int,
    image_path,
    thumb_image,
    preview_storage: str,
    thumb_storage: str,
    preview_media_type: str = 'image/jpeg',
):
    """Record preview + thumbnail rows without relying on a DB conflict index.

    The safe upload renderer intentionally favours the old VPS-style contract:
    one page at a time, explicit phase boundaries, and repository-level
    idempotency. ``bulk_upsert_page_files`` is faster but requires the partial
    unique index to exist in production; this path must remain stable even if a
    migration is missing or delayed.
    """
    with Image.open(image_path) as im:
        prev_w, prev_h = im.size
    with Image.open(thumb_image) as im:
        thumb_w, thumb_h = im.size

    derived_file_repo.create_file(
        db,
        asset_id=asset_id,
        job_id=job_id,
        kind='preview_page',
        storage_path=preview_storage,
        media_type=preview_media_type,
        page=page,
        width=prev_w,
        height=prev_h,
        metadata={'size': 'preview'},
    )
    derived_file_repo.create_file(
        db,
        asset_id=asset_id,
        job_id=job_id,
        kind='thumbnail_page',
        storage_path=thumb_storage,
        media_type='image/png',
        page=page,
        width=thumb_w,
        height=thumb_h,
        metadata={'size': 'thumbnail'},
    )


def _valid_local_image(path) -> bool:
    try:
        if not path.exists() or path.stat().st_size < 200:
            return False
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


def _local_preview_pages(preview_dir, preview_ext: str, expected_pages: set[int]) -> set[int]:
    return {
        p for p in expected_pages
        if _valid_local_image(preview_dir / f"page-{p:03d}.{preview_ext}")
    }


def _future_timeout(page_count: int, *, phase: str) -> float:
    page_count = max(1, page_count)
    if phase == 'cpu':
        per_page = max(20, int(getattr(settings, 'preview_gs_page_timeout_seconds', 20) or 20) + 35)
        return float(min(240, max(60, page_count * per_page)))
    return float(min(180, max(45, page_count * 20)))


def _completed_or_timed_out(future_map: dict, *, timeout_seconds: float, label: str) -> list:
    try:
        return list(as_completed(future_map, timeout=timeout_seconds))
    except FuturesTimeoutError:
        pending_pages = [page for fut, page in future_map.items() if not fut.done()]
        logger.error(
            "%s timed out after %.1fs pending_pages=%s",
            label, timeout_seconds, pending_pages,
        )
        for fut in future_map:
            if not fut.done():
                fut.cancel()
        return [fut for fut in future_map if fut.done()]


def _emit_page_progress(db, *, job_id: str, asset_id: str, task_name: str, worker_name: str | None, completed_count: int, page_count: int) -> None:
    if not page_count:
        return
    # Small customer uploads need every-page feedback; larger documents keep
    # the old batching to avoid noisy telemetry.
    if page_count < 10 or completed_count % 5 == 0 or completed_count == page_count:
        page_evt = job_event_repo.start(
            db, job_id=job_id, asset_id=asset_id,
            task_name=task_name, queue_name='thumbnails',
            worker_name=worker_name,
            stage='page_batch',
            metadata={'rendered': completed_count, 'total': page_count},
            message=f'Rendered {completed_count} of {page_count} pages',
        )
        if page_evt is not None:
            job_event_repo.finish(
                db, page_evt.id, message='',
                metadata={'rendered': completed_count, 'total': page_count},
            )


def _record_existing_preview_pages(
    db,
    *,
    asset_id: str,
    job_id: str,
    prefix: str,
    preview_dir,
    thumb_dir,
    pages: list[int],
    preview_ext: str,
    preview_media_type: str,
) -> tuple[dict[int, tuple[str, str]], dict[int, str]]:
    """Retry thumbnail/upload/DB for pages already rasterized on local disk.

    This is the critical distinction for the 7/8 case: if GS created
    page-008.jpg, do not render page 8 again. Retry the tail IO/recording work
    and report that phase explicitly if it fails.
    """
    recorded: dict[int, tuple[str, str]] = {}
    failed: dict[int, str] = {}
    if not pages:
        return recorded, failed

    cpu_workers = max(1, min(settings.render_cpu_concurrency, len(pages)))
    io_workers = max(1, min(settings.render_io_concurrency, len(pages)))
    with ThreadPoolExecutor(max_workers=cpu_workers) as cpu_pool, \
         ThreadPoolExecutor(max_workers=io_workers) as io_pool:
        thumb_futures = {}
        for p in pages:
            image_path = preview_dir / f"page-{p:03d}.{preview_ext}"
            if not _valid_local_image(image_path):
                failed[p] = 'local preview image missing or invalid'
                continue
            thumb_image = thumb_dir / f"page-{p:03d}.png"
            thumb_futures[cpu_pool.submit(
                pdf_ops.downscale_to_thumbnail,
                image_path, thumb_image, 360,
            )] = (p, image_path, thumb_image)

        upload_futures = {}
        for fut in _completed_or_timed_out(
            thumb_futures,
            timeout_seconds=_future_timeout(len(thumb_futures), phase='cpu'),
            label='record_existing downscale',
        ):
            p, image_path, thumb_image = thumb_futures[fut]
            try:
                fut.result()
            except Exception as exc:
                failed[p] = f'downscale failed: {exc}'
                logger.warning("record_existing: downscale page %d failed: %s", p, exc)
                continue
            upload_futures[io_pool.submit(
                _upload_page_io,
                prefix=prefix, page=p,
                image_path=image_path, thumb_image=thumb_image,
                preview_ext=preview_ext,
                preview_media_type=preview_media_type,
            )] = (p, image_path, thumb_image)

        for fut in _completed_or_timed_out(
            upload_futures,
            timeout_seconds=_future_timeout(len(upload_futures), phase='io'),
            label='record_existing upload',
        ):
            p, image_path, thumb_image = upload_futures[fut]
            try:
                prev_sp, thumb_sp = fut.result()
                _record_page(
                    db, asset_id=asset_id, job_id=job_id, page=p,
                    image_path=image_path, thumb_image=thumb_image,
                    preview_storage=prev_sp, thumb_storage=thumb_sp,
                    preview_media_type=preview_media_type,
                )
            except Exception as exc:
                failed[p] = f'upload/db record failed: {exc}'
                logger.warning("record_existing: upload/record page %d failed: %s", p, exc)
                continue
            recorded[p] = (prev_sp, thumb_sp)
    return recorded, failed


@shared_task(bind=True, queue='thumbnails')
def render_one_page(
    self,
    *,
    asset_id: str,
    job_id: str,
    page: int,
    prepared_storage_path: str,
    prefix: str,
    dpi: int,
):
    """Render a single page of a prepared (already-cropped) PDF.

    This is the per-page fan-out unit used by ``generate_previews`` so a
    single upload occupies ALL light-queue worker children instead of one.
    Each invocation downloads ``prepared_storage_path`` into its own
    workspace, rasterises page ``page``, uploads preview + thumbnail, and
    records both ``derived_files`` rows. The parent task watches
    ``derived_files`` to determine completion (no chord/ result-backend
    coupling needed).
    """
    db = _db()
    try:
        with Workspace() as ws:
            src = ws.path('input.pdf')
            storage.download(prepared_storage_path, src)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            image_path, thumb_image, prev_sp, thumb_sp, prev_ext, prev_mt = _render_one_page(
                src_pdf=src, preview_dir=preview_dir, thumb_dir=thumb_dir,
                prefix=prefix, page=page, dpi=dpi,
            )
            _record_page(
                db, asset_id=asset_id, job_id=job_id, page=page,
                image_path=image_path, thumb_image=thumb_image,
                preview_storage=prev_sp, thumb_storage=thumb_sp,
                preview_media_type=prev_mt,
            )
            return {'page': page, 'preview_storage_path': prev_sp, 'thumbnail_storage_path': thumb_sp}
    except Exception as exc:
        logger.warning("render_one_page: page %d failed: %s", page, exc)
        # Don't mark the parent job failed — the parent watches the
        # derived_files table and will salvage missing pages itself.
        raise
    finally:
        db.close()


def _generate_previews_sequential(task, asset_id: str, job_id: str, render_box: list[float] | None = None):
    """VPS-style safe preview generation for normal customer uploads.

    One backend job owns the whole render. Pages are processed 1..N in order,
    and the job is only completed after every page has both preview + thumbnail
    rows recorded. This deliberately avoids the newer batch/fan-out/salvage
    layers that exposed partial state to the upload UI.
    """
    db = _db()
    evt_overall = None
    render_context: dict = {}
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        if not asset:
            raise NonRetryableTaskError(f"Asset not found: {asset_id}")

        prefix = _tenant_prefix(asset.get('source_storage_path'))
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        page_count = int(asset.get('page_count') or 0)
        worker_name = getattr(getattr(task, 'request', None), 'hostname', None)

        evt_overall = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='generate_previews',
            queue_name='thumbnails',
            worker_name=worker_name,
            stage='render_sequential',
            metadata={
                'page_count': page_count,
                'dpi': settings.preview_dpi,
                'safe_mode': True,
                'runtime': _runtime_meta(),
            },
            message=f'Rendering {page_count or "?"} page(s) sequentially…',
        )

        timings: dict[str, int] = {}

        def _stamp(label: str, t_start: float) -> None:
            timings[label] = int((time.monotonic() - t_start) * 1000)

        with Workspace() as ws:
            src = ws.path('input.pdf')
            _download_pdf_with_cache(src_path, src, asset_id=asset_id, timings=timings)

            t_box = time.monotonic()
            effective_render_box = render_box
            render_box_mode = (
                getattr(settings, 'preview_render_box_mode', 'metadata_only')
                or 'metadata_only'
            ).lower()
            if effective_render_box is None:
                try:
                    effective_render_box = pdf_ops.derive_default_render_box(src)
                except Exception as exc:
                    logger.warning(
                        "generate_previews_safe: derive_default_render_box failed: %s", exc,
                    )
                    effective_render_box = None

            render_context = {
                'render_box_mode': render_box_mode,
                'detected_render_box': effective_render_box,
                'rendered_source': 'original_pdf',
                'safe_mode': 'sequential',
            }

            if effective_render_box is not None and render_box_mode == 'rewrite_pdf':
                cropped = ws.path('cropped.pdf')
                pdf_ops.crop_to_box(src, cropped, effective_render_box)
                src = cropped
                render_context['rendered_source'] = 'pikepdf_box_rewrite'
            _stamp('prepare_render_box', t_box)

            if not page_count:
                t_inspect = time.monotonic()
                info = pdf_ops.inspect(src)
                page_count = int(info.get('page_count') or 0)
                asset_repo.update_asset(db, asset_id, {
                    'page_count': page_count,
                    'width_pt': info.get('width_pt'),
                    'height_pt': info.get('height_pt'),
                    'boxes': info.get('boxes'),
                })
                _stamp('inspect_for_page_count', t_inspect)

            if page_count <= 0:
                msg = 'Cannot render previews: page count is unknown'
                job_repo.mark_failed(db, job_id, msg)
                if evt_overall:
                    job_event_repo.fail(db, evt_overall.id, message=msg)
                    evt_overall = None
                raise NonRetryableTaskError(msg)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            completed_pages: set[int] = set()
            page_storage: dict[int, tuple[str, str]] = {}
            files_created: list[dict] = []
            preview_path: str | None = None
            thumb_path: str | None = None
            t_pages = time.monotonic()

            page_timeout = max(
                30.0,
                float(getattr(settings, 'preview_gs_page_timeout_seconds', 20) or 20),
            )

            for page in range(1, page_count + 1):
                phase = 'raster'
                try:
                    image_path = _retry_with_backoff(
                        lambda page=page: pdf_ops.rasterize_one_page_ghostscript_jpeg(
                            src,
                            preview_dir / 'page',
                            dpi=settings.preview_dpi,
                            page=page,
                            quality=settings.preview_jpeg_quality,
                            timeout_seconds=page_timeout,
                        ),
                        label='safe_rasterize_page',
                        page=page,
                    )
                    if not _valid_local_image(image_path):
                        raise RuntimeError('rendered preview image is missing or invalid')

                    phase = 'thumbnail'
                    thumb_image = thumb_dir / f"page-{page:03d}.png"
                    _retry_with_backoff(
                        lambda: pdf_ops.downscale_to_thumbnail(
                            image_path, thumb_image, target_max_dim=360,
                        ),
                        label='safe_downscale_thumbnail',
                        page=page,
                    )
                    if not _valid_local_image(thumb_image):
                        raise RuntimeError('thumbnail image is missing or invalid')

                    phase = 'upload_preview'
                    preview_storage = unique_name(f'{prefix}previews/page-{page:03d}', '.jpg')
                    _retry_with_backoff(
                        lambda: storage.upload(image_path, preview_storage, 'image/jpeg'),
                        label='safe_upload_preview',
                        page=page,
                    )

                    phase = 'upload_thumbnail'
                    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page:03d}', '.png')
                    _retry_with_backoff(
                        lambda: storage.upload(thumb_image, thumb_storage, 'image/png'),
                        label='safe_upload_thumbnail',
                        page=page,
                    )

                    phase = 'record'
                    _retry_with_backoff(
                        lambda: _record_page_sequential(
                            db,
                            asset_id=asset_id,
                            job_id=job_id,
                            page=page,
                            image_path=image_path,
                            thumb_image=thumb_image,
                            preview_storage=preview_storage,
                            thumb_storage=thumb_storage,
                            preview_media_type='image/jpeg',
                        ),
                        label='safe_record_page',
                        page=page,
                    )

                    if page == 1:
                        preview_path = preview_storage
                        thumb_path = thumb_storage
                        asset_repo.update_asset(db, asset_id, {
                            'thumbnail_storage_path': thumb_path,
                            'preview_storage_path': preview_path,
                        })

                    page_storage[page] = (preview_storage, thumb_storage)
                    completed_pages.add(page)
                    files_created.append({'kind': 'preview_page', 'page': page, 'storage_path': preview_storage})
                    files_created.append({'kind': 'thumbnail_page', 'page': page, 'storage_path': thumb_storage})
                    _emit_page_progress(
                        db,
                        job_id=job_id,
                        asset_id=asset_id,
                        task_name='generate_previews',
                        worker_name=worker_name,
                        completed_count=len(completed_pages),
                        page_count=page_count,
                    )
                except Exception as exc:  # noqa: BLE001
                    msg = f"Preview render failed on page {page}/{page_count} during {phase}: {exc}"
                    logger.exception("generate_previews_safe: %s", msg)
                    job_repo.mark_failed(db, job_id, msg)
                    if evt_overall:
                        job_event_repo.fail(
                            db,
                            evt_overall.id,
                            message=msg,
                            metadata={
                                'failed_page': page,
                                'failed_phase': phase,
                                'completed_pages': sorted(completed_pages),
                                'page_count': page_count,
                                'render_context': render_context,
                            },
                        )
                        evt_overall = None
                    raise NonRetryableTaskError(msg) from exc

            _stamp('render_pages_sequential', t_pages)

            expected_pages = set(range(1, page_count + 1))
            db_present = derived_file_repo.pages_present_both(db, asset_id)
            still_missing = sorted(expected_pages - (db_present & expected_pages))
            if still_missing:
                msg = f"Incomplete render after sequential verification: missing pages {still_missing} of {page_count}"
                job_repo.mark_failed(db, job_id, msg)
                if evt_overall:
                    job_event_repo.fail(
                        db,
                        evt_overall.id,
                        message=msg,
                        metadata={
                            'missing_pages': still_missing,
                            'completed_pages': sorted(completed_pages),
                            'db_present': sorted(db_present & expected_pages),
                            'render_context': render_context,
                        },
                    )
                    evt_overall = None
                raise NonRetryableTaskError(msg)

            asset_repo.update_asset(db, asset_id, {
                'thumbnail_storage_path': thumb_path or (page_storage.get(1, (None, None))[1]),
                'preview_storage_path': preview_path or (page_storage.get(1, (None, None))[0]),
                'status': 'ready',
            })
            pages_rendered = len(completed_pages)
            result = {
                'thumbnail_storage_path': thumb_path,
                'preview_storage_path': preview_path,
                'pages_rendered': pages_rendered,
                'expected_pages': page_count,
                'files_created': files_created[:20],
                'timings_ms': timings,
                'render_context': render_context,
                'safe_mode': 'sequential',
            }
            job_repo.mark_done(db, job_id, result)
            if evt_overall:
                job_event_repo.finish(
                    db,
                    evt_overall.id,
                    metadata={
                        'pages_rendered': pages_rendered,
                        'expected': page_count,
                        'timings_ms': timings,
                        'render_context': render_context,
                    },
                    message=f'Rendered {pages_rendered} of {page_count} page(s)',
                )
                evt_overall = None
            return {'pages_rendered': pages_rendered, 'expected_pages': page_count}
    except NonRetryableTaskError:
        raise
    except Exception as exc:
        if evt_overall:
            try:
                job_event_repo.fail(db, evt_overall.id, message=str(exc))
            except Exception:
                pass
        try:
            job_repo.mark_failed(db, job_id, traceback.format_exc())
        except Exception:
            pass
        raise exc
    finally:
        db.close()


@shared_task(bind=True, queue='thumbnails', soft_time_limit=600, time_limit=660)
def generate_previews(self, asset_id: str, job_id: str, render_box: list[float] | None = None):
    """Generate previews + thumbnails for an asset.

    Hardened contract (this is the part that matters for "missing page"
    bugs): the asset is only flipped to ``status='ready'`` and the job is
    only marked ``done`` when EVERY page from 1..page_count has both a
    ``preview_page`` and a ``thumbnail_page`` derived file recorded. Any
    page that fails its parallel pipeline goes through:

      1. Per-step retries (rasterize / downscale / upload / DB write) with
         exponential backoff.
      2. A sequential "salvage" pass for any pages still missing after the
         parallel pool drains.
      3. If anything is still missing, the job is marked FAILED with
         ``metadata.missing_pages=[…]`` and the asset stays at its prior
         status. The frontend can then call POST
         ``/v1/assets/{id}/render-pages`` to surgically re-render the gaps
         without re-uploading the original.
    """
    if getattr(settings, 'preview_safe_sequential_enabled', True):
        return _generate_previews_sequential(self, asset_id, job_id, render_box)

    db = _db()
    evt_overall = None
    render_context: dict = {}
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        prefix = _tenant_prefix(asset.get('source_storage_path'))
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        page_count = asset.get('page_count') or 0

        logger.info(
            "generate_previews: asset=%s expected_pages=%s dpi=%s",
            asset_id, page_count, settings.preview_dpi,
        )

        evt_overall = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='generate_previews',
            queue_name='thumbnails',
            worker_name=self.request.hostname if self.request else None,
            stage='render',
            metadata={
                'page_count': page_count,
                'dpi': settings.preview_dpi,
                'runtime': _runtime_meta(),
            },
            message=f'Rendering {page_count or "?"} page(s)…',
        )


        timings: dict[str, int] = {}

        def _stamp(label: str, t_start: float) -> None:
            timings[label] = int((time.monotonic() - t_start) * 1000)

        with Workspace() as ws:
            src = ws.path('input.pdf')
            _download_pdf_with_cache(src_path, src, asset_id=asset_id, timings=timings)

            # If caller didn't specify a render_box, auto-derive one from
            # the PDF's own TrimBox/BleedBox so previews show the finished
            # page edge (no bleed margin / crop marks). This protects against
            # callers that pass `null` after rotate/resize/print-ready.
            t_box = time.monotonic()
            effective_render_box = render_box
            render_box_mode = (
                getattr(settings, 'preview_render_box_mode', 'metadata_only')
                or 'metadata_only'
            ).lower()
            if effective_render_box is None:
                try:
                    effective_render_box = pdf_ops.derive_default_render_box(src)
                except Exception as exc:
                    logger.warning(
                        "generate_previews: derive_default_render_box failed: %s", exc,
                    )
                    effective_render_box = None

            render_context = {
                'render_box_mode': render_box_mode,
                'detected_render_box': effective_render_box,
                'rendered_source': 'original_pdf',
            }

            if effective_render_box is not None and render_box_mode == 'rewrite_pdf':
                cropped = ws.path('cropped.pdf')
                pdf_ops.crop_to_box(src, cropped, effective_render_box)
                src = cropped
                render_context['rendered_source'] = 'pikepdf_box_rewrite'
            _stamp('prepare_render_box', t_box)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            files_created: list[dict] = []
            preview_path: str | None = None
            thumb_path: str | None = None

            if not page_count:
                # Without an expected page count we can't enforce the
                # contract — fall through to legacy "best-effort" behaviour
                # for the page-1 fast path only.
                page_count = 0

            expected_pages: set[int] = set(range(1, page_count + 1)) if page_count else set()
            completed_pages: set[int] = set()
            page_storage: dict[int, tuple[str, str]] = {}
            renderer_terminal_missing: set[int] = set()
            local_rasterized_pages: set[int] = set()
            record_missing_errors: dict[int, str] = {}

            # ─── Batch render (Ghostscript → JPEG, single invocation) ──
            # PDF → JPEG in ONE `gs` call. Locally benchmarked at ~3.5s for
            # an 8-page 17 MB CMYK A4 brochure with transparency. The old
            # MuPDF batch + fast-path + retry maze ran the same file in
            # >60s because mutool's painter stalls on transparency groups
            # and we were piping through PNG → Pillow → JPEG anyway.
            #
            # Pipeline:
            #   1. gs PDF→JPEG for pages 1..N (primary).
            #   2. Single-page gs retry for any page the batch dropped.
            #   3. Per-page mutool last-resort salvage (in case gs itself
            #      refuses a malformed page).
            # Then downscale + upload + DB-record concurrently.
            batch_threshold = max(1, settings.render_batch_threshold)
            batch_eligible = (
                page_count
                and page_count <= batch_threshold
                and page_count >= 1
            )
            renderer = (
                getattr(settings, "preview_renderer", "ghostscript") or "ghostscript"
            ).lower()
            preview_ext = 'jpg'
            preview_media_type = 'image/jpeg'

            if batch_eligible:
                t_batch = time.monotonic()
                renderer_diagnostic: dict | None = None
                still_missing_after_retry: list[int] = []

                if renderer == "mutool":
                    # Legacy path kept behind the flag — exercises the
                    # original MuPDF batch (handy for A/B if we ever need
                    # to compare a regression).
                    _eff_fmt, preview_ext = mutool_effective_format(settings.preview_format)
                    preview_media_type = 'image/jpeg' if preview_ext == 'jpg' else 'image/png'
                    try:
                        t_r = time.monotonic()
                        pdf_ops.rasterize_pages_mutool(
                            src, preview_dir / 'page', dpi=settings.preview_dpi,
                            first_page=1, last_page=page_count,
                            fmt=settings.preview_format,
                            quality=settings.preview_jpeg_quality,
                        )
                        _stamp('render_batch_mutool', t_r)
                    except MutoolRenderError as exc:
                        renderer_diagnostic = {
                            'engine': 'mutool',
                            'missing_pages': exc.missing_pages,
                            'returncode': exc.returncode,
                            'stderr_tail': "\n".join(
                                (exc.stderr or "").strip().splitlines()[-5:]
                            ),
                        }
                        still_missing_after_retry = list(exc.missing_pages)
                else:
                    # PRIMARY PATH — Ghostscript direct-to-JPEG.
                    try:
                        t_r = time.monotonic()
                        pdf_ops.rasterize_pages_ghostscript_jpeg(
                            src, preview_dir / 'page',
                            dpi=settings.preview_dpi,
                            first_page=1, last_page=page_count,
                            quality=settings.preview_jpeg_quality,
                        )
                        _stamp('render_batch_gs', t_r)
                    except RasterizationIncompleteError as exc:
                        try:
                            src_bytes = src.stat().st_size if hasattr(src, 'stat') else None
                        except Exception:
                            src_bytes = None
                        renderer_diagnostic = {
                            'engine': 'ghostscript',
                            'missing_pages': list(exc.missing_pages),
                            'returncode': getattr(exc, 'returncode', None),
                            'timed_out': getattr(exc, 'timed_out', False),
                            'elapsed_ms': getattr(exc, 'elapsed_ms', None),
                            'stderr_tail': "\n".join(
                                (getattr(exc, 'stderr', '') or '').strip().splitlines()[-8:]
                            ),
                            'produced': getattr(exc, 'produced', []),
                            'src_bytes': src_bytes,
                            'page_count': page_count,
                            'preview_dpi': settings.preview_dpi,
                            'preview_jpeg_quality': settings.preview_jpeg_quality,
                            'preview_gs_threads': getattr(settings, 'preview_gs_threads', None),
                            'preview_gs_batch_timeout_seconds': getattr(settings, 'preview_gs_batch_timeout_seconds', None),
                            'render_context': render_context,
                        }
                        logger.warning(
                            "gs batch incomplete asset=%s missing=%s — running single-page gs retry",
                            asset_id, exc.missing_pages,
                        )

                        # Single-page gs retry, in parallel.
                        retry_pages = list(exc.missing_pages)
                        retry_workers = max(
                            1, min(len(retry_pages) or 1, settings.render_cpu_concurrency)
                        )

                        def _gs_retry_one(pn: int):
                            t0 = time.monotonic()
                            try:
                                pdf_ops.rasterize_one_page_ghostscript_jpeg(
                                    src, preview_dir / 'page',
                                    dpi=settings.preview_dpi, page=pn,
                                    quality=settings.preview_jpeg_quality,
                                )
                                return {'page': pn, 'ok': True,
                                        'elapsed_ms': int((time.monotonic() - t0) * 1000)}
                            except Exception as e2:
                                return {'page': pn, 'ok': False,
                                        'error': f"{type(e2).__name__}: {e2}",
                                        'elapsed_ms': int((time.monotonic() - t0) * 1000)}

                        retry_results: list[dict] = []
                        t_retry = time.monotonic()
                        with ThreadPoolExecutor(max_workers=retry_workers) as rp:
                            for res in rp.map(_gs_retry_one, retry_pages):
                                retry_results.append(res)
                                if not res.get('ok'):
                                    still_missing_after_retry.append(res['page'])
                        _stamp('render_gs_retry', t_retry)
                        renderer_diagnostic['gs_retry'] = {
                            'attempted': retry_pages,
                            'still_missing': still_missing_after_retry,
                            'results': retry_results,
                        }

                        # Last-resort: mutool for anything gs refused. Disabled
                        # by default for customer previews because the VPS did
                        # not need this loop and it can turn three missing pages
                        # into several extra minutes of waiting.
                        if still_missing_after_retry and getattr(settings, 'preview_mutool_salvage_enabled', False):
                            logger.warning(
                                "gs retry STILL missing asset=%s pages=%s — trying mutool salvage",
                                asset_id, still_missing_after_retry,
                            )
                            mutool_salvaged: list[int] = []
                            t_mutool = time.monotonic()
                            for pn in list(still_missing_after_retry):
                                try:
                                    pdf_ops.rasterize_one_page_mutool(
                                        src, preview_dir / 'page',
                                        dpi=settings.preview_dpi, page=pn,
                                        fmt='jpeg',
                                    )
                                    mutool_salvaged.append(pn)
                                except Exception as e3:
                                    logger.warning(
                                        "mutool salvage failed asset=%s page=%d: %s",
                                        asset_id, pn, e3,
                                    )
                            _stamp('render_mutool_salvage', t_mutool)
                            renderer_diagnostic['mutool_salvage'] = {
                                'attempted': list(still_missing_after_retry),
                                'recovered': mutool_salvaged,
                            }
                            still_missing_after_retry = [
                                p for p in still_missing_after_retry
                                if p not in mutool_salvaged
                            ]
                        elif still_missing_after_retry:
                            renderer_diagnostic['mutool_salvage'] = {
                                'skipped': True,
                                'reason': 'PREVIEW_MUTOOL_SALVAGE_ENABLED=false',
                                'still_missing': list(still_missing_after_retry),
                            }
                        if still_missing_after_retry:
                            renderer_terminal_missing.update(still_missing_after_retry)
                    except Exception as exc:
                        logger.warning(
                            "gs batch raised unexpected error asset=%s: %s",
                            asset_id, exc,
                        )
                        renderer_diagnostic = {
                            'engine': 'ghostscript',
                            'unexpected_error': f"{type(exc).__name__}: {exc}",
                        }

                if renderer_diagnostic is not None:
                    # Surface the failure detail in the admin UI.
                    diag_evt = job_event_repo.start(
                        db, job_id=job_id, asset_id=asset_id,
                        task_name='generate_previews', queue_name='thumbnails',
                        worker_name=self.request.hostname if self.request else None,
                        stage='render_incomplete',
                        metadata={**renderer_diagnostic, 'runtime': _runtime_meta()},
                        message=(
                            'Primary renderer dropped pages; gaps filled by retry/salvage'
                            if not still_missing_after_retry
                            else f"Pages still missing after retry: {still_missing_after_retry}"
                        ),
                    )
                    if diag_evt is not None:
                        job_event_repo.finish(
                            db, diag_evt.id,
                            status='failed' if still_missing_after_retry else 'done',
                            message='render_incomplete',
                        )

                # Downscale → upload → record everything that landed on disk.
                # Keep this as a separate "record existing renders" phase so
                # an upload/DB hiccup does not get mislabeled as Ghostscript
                # missing a page, and does not force a pointless re-render.
                try:
                    local_rasterized_pages = _local_preview_pages(preview_dir, preview_ext, expected_pages)
                    raster_missing = sorted(expected_pages - local_rasterized_pages)
                    recorded, record_failed = _record_existing_preview_pages(
                        db,
                        asset_id=asset_id,
                        job_id=job_id,
                        prefix=prefix,
                        preview_dir=preview_dir,
                        thumb_dir=thumb_dir,
                        pages=sorted(local_rasterized_pages),
                        preview_ext=preview_ext,
                        preview_media_type=preview_media_type,
                    )
                    record_missing_errors.update(record_failed)
                    for p, (prev_sp, thumb_sp) in sorted(recorded.items()):
                        page_storage[p] = (prev_sp, thumb_sp)
                        completed_pages.add(p)
                        files_created.append({'kind': 'preview_page', 'page': p, 'storage_path': prev_sp})
                        files_created.append({'kind': 'thumbnail_page', 'page': p, 'storage_path': thumb_sp})
                        if p == 1:
                            preview_path = prev_sp
                            thumb_path = thumb_sp
                            asset_repo.update_asset(db, asset_id, {
                                'thumbnail_storage_path': thumb_path,
                                'preview_storage_path': preview_path,
                            })
                        _emit_page_progress(
                            db,
                            job_id=job_id,
                            asset_id=asset_id,
                            task_name='generate_previews',
                            worker_name=self.request.hostname if self.request else None,
                            completed_count=len(completed_pages),
                            page_count=page_count,
                        )
                    _stamp('batch_total', t_batch)
                    logger.info(
                        "generate_previews: batch path (%s) asset=%s recorded=%d/%d local_rasterized=%d raster_missing=%s record_missing=%s ext=%s timings_ms=%s",
                        renderer, asset_id, len(completed_pages), page_count,
                        len(local_rasterized_pages), raster_missing,
                        sorted(record_missing_errors), preview_ext, timings,
                    )
                except Exception as exc:
                    logger.warning(
                        "generate_previews: batch upload/record path failed (will fall back): %s", exc,
                    )




            # ─── Page-1 fast path (skipped if batch already covered it) ─
            if 1 in completed_pages or 1 in local_rasterized_pages:
                pass
            else:
                try:
                    image_path, thumb_image, prev_sp, thumb_sp, prev_ext, prev_mt = _render_one_page(
                        src_pdf=src, preview_dir=preview_dir, thumb_dir=thumb_dir,
                        prefix=prefix, page=1, dpi=settings.preview_dpi,
                    )
                    _record_page(
                        db, asset_id=asset_id, job_id=job_id, page=1,
                        image_path=image_path, thumb_image=thumb_image,
                        preview_storage=prev_sp, thumb_storage=thumb_sp,
                        preview_media_type=prev_mt,
                    )
                    preview_path = prev_sp
                    thumb_path = thumb_sp
                    page_storage[1] = (prev_sp, thumb_sp)
                    completed_pages.add(1)
                    files_created.append({'kind': 'preview_page', 'page': 1, 'storage_path': prev_sp})
                    files_created.append({'kind': 'thumbnail_page', 'page': 1, 'storage_path': thumb_sp})

                    asset_repo.update_asset(db, asset_id, {
                        'thumbnail_storage_path': thumb_path,
                        'preview_storage_path': preview_path,
                    })
                    p1_evt = job_event_repo.start(
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
                    if p1_evt is not None:
                        job_event_repo.finish(db, p1_evt.id, message='', metadata={'page': 1})
                except Exception as exc:
                    logger.warning("generate_previews: page-1 fast path failed: %s", exc)
                    job_event_repo.start(
                        db,
                        job_id=job_id,
                        asset_id=asset_id,
                        task_name='generate_previews',
                        queue_name='thumbnails',
                        worker_name=self.request.hostname if self.request else None,
                        stage='page_failed',
                        metadata={'page': 1, 'error': str(exc)},
                        message=f'Page 1 failed: {exc}',
                    )

            # ─── Per-page parallel pass for remaining pages ────────────
            # Two strategies:
            #  (a) FANOUT (default): upload the prepared PDF once, dispatch
            #      one Celery subtask per page on the thumbnails queue, then
            #      poll derived_files for completion. This uses ALL light-
            #      worker children (typically 4) so an 8-page job finishes
            #      in ~2 page-renders worth of wall time instead of 8.
            #  (b) IN-PROCESS (FANOUT_ENABLED=false): the original two-pool
            #      ThreadPoolExecutor design — pinned to one worker child.
            if page_count and page_count > 1:
                # Only rasterize pages that do not already have a valid local
                # batch image. Pages with a local preview but failed upload/DB
                # remain record_missing; re-rendering them wastes minutes and
                # hides the actual failing phase.
                remaining = [
                    p for p in range(2, page_count + 1)
                    if p not in completed_pages and p not in local_rasterized_pages
                ]

                # Cloud Tasks fan-out is a regression vs the VPS Celery prefork
                # pool: each per-page task becomes an HTTP push that has to spin
                # up its own Cloud Run instance (concurrency=1, cold-start, fresh
                # S3 download). Empirically this turns a 24-page job into a
                # 6-minute wait-and-salvage dance. The in-process ThreadPoolExecutor
                # path uses all 4 vCPUs of one warm light worker — exactly what
                # the VPS achieved — so force it on under Cloud Tasks regardless
                # of RENDER_FANOUT_ENABLED. Keep fan-out available for local
                # Celery dev where workers are already warm.
                # Belt-and-braces: disable fan-out whenever we're running on
                # Cloud Run (QUEUE_BACKEND=cloud_tasks OR ROLE=worker-*-http).
                # Either signal alone is enough — so even if env drift leaves
                # QUEUE_BACKEND unset on a worker, the ROLE check still keeps
                # us on the in-process path that matches the old VPS Celery
                # prefork behaviour.
                _queue_backend = os.getenv("QUEUE_BACKEND", "celery").lower()
                _role = os.getenv("ROLE", "").lower()
                _on_cloud_run = (
                    _queue_backend == "cloud_tasks"
                    or (_role.startswith("worker-") and _role.endswith("-http"))
                )
                fanout_active = (
                    FANOUT_ENABLED
                    and not _on_cloud_run
                    and len(remaining) >= 2
                )
                if not fanout_active and len(remaining) >= 2 and FANOUT_ENABLED and _on_cloud_run:
                    logger.info(
                        "generate_previews: fan-out disabled on Cloud Run "
                        "(queue_backend=%s role=%s, would dispatch %d per-page "
                        "tasks via HTTP push). Using in-process ThreadPoolExecutor.",
                        _queue_backend, _role, len(remaining),
                    )
                if fanout_active:
                    # Upload the prepared (possibly cropped) PDF once so
                    # subtasks don't each re-download + re-crop the source.
                    prepared_storage_path = unique_name(f'{prefix}tmp/render-prepared', '.pdf')
                    storage.upload(src, prepared_storage_path, 'application/pdf')
                    logger.info(
                        "generate_previews: fan-out dispatch pages=%d prepared=%s",
                        len(remaining), prepared_storage_path,
                    )
                    for p in remaining:
                        enqueue(
                            "render_one_page",
                            queue="thumbnails",
                            asset_id=asset_id, job_id=job_id, page=p,
                            prepared_storage_path=prepared_storage_path,
                            prefix=prefix, dpi=settings.preview_dpi,
                        )

                    # Poll derived_files until all pages land or we time out.
                    # Two exit conditions besides "all done":
                    #   (a) hard deadline (render_fanout_timeout_seconds)
                    #   (b) stall guard: if no new pages land for
                    #       render_fanout_stall_seconds, bail out early so
                    #       the salvage pass can recover the missing pages
                    #       instead of sitting through the full timeout.
                    poll_interval = max(0.05, settings.render_fanout_poll_interval_ms / 1000.0)
                    deadline = time.monotonic() + max(10, settings.render_fanout_timeout_seconds)
                    stall_window = max(5, getattr(settings, 'render_fanout_stall_seconds', 30))
                    last_event_count = len(completed_pages)
                    last_progress_at = time.monotonic()
                    target = set(remaining)
                    while True:
                        # Single query for both kinds — was two pages_present()
                        # round-trips per poll tick.
                        present = derived_file_repo.pages_present_both(db, asset_id)
                        landed = (present & target) - completed_pages
                        for page_num in sorted(landed):
                            completed_pages.add(page_num)
                            files_created.append({'kind': 'preview_page', 'page': page_num, 'storage_path': None})
                            files_created.append({'kind': 'thumbnail_page', 'page': page_num, 'storage_path': None})

                        completed_count = len(completed_pages)
                        if completed_count != last_event_count:
                            last_progress_at = time.monotonic()
                            _emit_page_progress(
                                db,
                                job_id=job_id,
                                asset_id=asset_id,
                                task_name='generate_previews',
                                worker_name=self.request.hostname if self.request else None,
                                completed_count=completed_count,
                                page_count=page_count,
                            )
                            last_event_count = completed_count

                        if target.issubset(completed_pages):
                            break
                        now = time.monotonic()
                        if now > deadline:
                            logger.warning(
                                "generate_previews: fan-out timeout asset=%s missing=%s",
                                asset_id, sorted(target - completed_pages),
                            )
                            break
                        if (now - last_progress_at) > stall_window:
                            logger.warning(
                                "generate_previews: fan-out stalled %ss asset=%s missing=%s — falling through to salvage",
                                int(now - last_progress_at), asset_id,
                                sorted(target - completed_pages),
                            )
                            break
                        time.sleep(poll_interval)


                    # Cleanup the temp prepared PDF — best effort.
                    try:
                        storage.delete(prepared_storage_path)
                    except Exception:
                        pass

                else:
                    # ─── In-process two-pool fallback ───────────────────
                    cpu_workers = max(1, settings.render_cpu_concurrency)
                    io_workers = max(1, settings.render_io_concurrency)
                    logger.info(
                        "generate_previews: in-process parallel pass pages=%d cpu_pool=%d io_pool=%d",
                        len(remaining), cpu_workers, io_workers,
                    )

                    completed_count = len(completed_pages)
                    with ThreadPoolExecutor(max_workers=cpu_workers) as cpu_pool, \
                         ThreadPoolExecutor(max_workers=io_workers) as io_pool:

                        cpu_futures = {
                            cpu_pool.submit(
                                _render_page_cpu,
                                src_pdf=src, preview_dir=preview_dir,
                                thumb_dir=thumb_dir, page=p, dpi=settings.preview_dpi,
                            ): p
                            for p in remaining
                        }

                        io_futures: dict = {}
                        for cpu_fut in _completed_or_timed_out(
                            cpu_futures,
                            timeout_seconds=_future_timeout(len(cpu_futures), phase='cpu'),
                            label='generate_previews CPU phase',
                        ):
                            page_num = cpu_futures[cpu_fut]
                            try:
                                image_path, thumb_image, prev_ext, prev_mt = cpu_fut.result()
                            except Exception as exc:
                                logger.warning(
                                    "generate_previews: CPU phase page %d failed: %s",
                                    page_num, exc,
                                )
                                continue

                            io_fut = io_pool.submit(
                                _upload_page_io,
                                prefix=prefix, page=page_num,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_ext=prev_ext, preview_media_type=prev_mt,
                            )
                            io_futures[io_fut] = (page_num, image_path, thumb_image, prev_mt)

                        for io_fut in _completed_or_timed_out(
                            io_futures,
                            timeout_seconds=_future_timeout(len(io_futures), phase='io'),
                            label='generate_previews IO phase',
                        ):
                            page_num, image_path, thumb_image, prev_mt = io_futures[io_fut]
                            try:
                                prev_sp, thumb_sp = io_fut.result()
                                _record_page(
                                    db, asset_id=asset_id, job_id=job_id, page=page_num,
                                    image_path=image_path, thumb_image=thumb_image,
                                    preview_storage=prev_sp, thumb_storage=thumb_sp,
                                    preview_media_type=prev_mt,
                                )
                            except Exception as exc:
                                logger.warning(
                                    "generate_previews: IO/record page %d failed: %s",
                                    page_num, exc,
                                )
                                continue

                            page_storage[page_num] = (prev_sp, thumb_sp)
                            completed_pages.add(page_num)
                            completed_count += 1
                            files_created.append({'kind': 'preview_page', 'page': page_num, 'storage_path': prev_sp})
                            files_created.append({'kind': 'thumbnail_page', 'page': page_num, 'storage_path': thumb_sp})

                            _emit_page_progress(
                                db,
                                job_id=job_id,
                                asset_id=asset_id,
                                task_name='generate_previews',
                                worker_name=self.request.hostname if self.request else None,
                                completed_count=completed_count,
                                page_count=page_count,
                            )

            # ─── Salvage pass: small two-pool retry for any still-missing
            # Salvage runs with tiny pools (cpu=2, io=2) — by definition the
            # unhappy path, but still wildly faster than the old fully
            # sequential loop (we saw a 247 s salvage in production).
            missing = sorted(expected_pages - completed_pages)
            record_missing = [p for p in missing if p in local_rasterized_pages]
            if record_missing:
                logger.warning(
                    "generate_previews: retrying record-only pages asset=%s pages=%s errors=%s",
                    asset_id, record_missing,
                    {p: record_missing_errors.get(p) for p in record_missing},
                )
                record_evt = job_event_repo.start(
                    db, job_id=job_id, asset_id=asset_id,
                    task_name='generate_previews', queue_name='thumbnails',
                    worker_name=self.request.hostname if self.request else None,
                    stage='record_existing',
                    metadata={
                        'pages': record_missing,
                        'previous_errors': {str(p): record_missing_errors.get(p) for p in record_missing},
                    },
                    message=f'Recording {len(record_missing)} already-rendered page(s)…',
                )
                recorded, record_failed = _record_existing_preview_pages(
                    db,
                    asset_id=asset_id,
                    job_id=job_id,
                    prefix=prefix,
                    preview_dir=preview_dir,
                    thumb_dir=thumb_dir,
                    pages=record_missing,
                    preview_ext=preview_ext,
                    preview_media_type=preview_media_type,
                )
                record_missing_errors.update(record_failed)
                for p, (prev_sp, thumb_sp) in sorted(recorded.items()):
                    page_storage[p] = (prev_sp, thumb_sp)
                    completed_pages.add(p)
                    files_created.append({'kind': 'preview_page', 'page': p, 'storage_path': prev_sp})
                    files_created.append({'kind': 'thumbnail_page', 'page': p, 'storage_path': thumb_sp})
                    _emit_page_progress(
                        db,
                        job_id=job_id,
                        asset_id=asset_id,
                        task_name='generate_previews',
                        worker_name=self.request.hostname if self.request else None,
                        completed_count=len(completed_pages),
                        page_count=page_count,
                    )
                if record_evt is not None:
                    job_event_repo.finish(
                        db, record_evt.id,
                        status='done' if len(recorded) == len(record_missing) else 'failed',
                        metadata={
                            'recorded': sorted(recorded),
                            'failed': {str(p): record_missing_errors.get(p) for p in record_missing if p not in recorded},
                        },
                        message='Record-existing pass complete',
                    )

            missing = sorted(expected_pages - completed_pages)
            salvage_missing = [p for p in missing if p not in renderer_terminal_missing and p not in local_rasterized_pages]
            if salvage_missing and settings.preview_salvage_enabled:
                logger.warning(
                    "generate_previews: salvage pass for asset=%s pages=%s",
                    asset_id, salvage_missing,
                )
                salvage_evt = job_event_repo.start(
                    db, job_id=job_id, asset_id=asset_id,
                    task_name='generate_previews', queue_name='thumbnails',
                    worker_name=self.request.hostname if self.request else None,
                    stage='salvage',
                    metadata={'missing': salvage_missing, 'renderer_terminal_missing': sorted(renderer_terminal_missing)},
                    message=f'Salvaging {len(salvage_missing)} missing page(s)…',
                )

                salvage_cpu = max(1, min(2, settings.render_cpu_concurrency))
                salvage_io = max(1, min(2, settings.render_io_concurrency))
                with ThreadPoolExecutor(max_workers=salvage_cpu) as cpu_pool, \
                     ThreadPoolExecutor(max_workers=salvage_io) as io_pool:

                    cpu_futures = {
                        cpu_pool.submit(
                            _render_page_cpu,
                            src_pdf=src, preview_dir=preview_dir,
                            thumb_dir=thumb_dir, page=p, dpi=settings.preview_dpi,
                        ): p
                        for p in salvage_missing
                    }
                    io_futures = {}
                    for cpu_fut in _completed_or_timed_out(
                        cpu_futures,
                        timeout_seconds=_future_timeout(len(cpu_futures), phase='cpu'),
                        label='salvage CPU phase',
                    ):
                        page_num = cpu_futures[cpu_fut]
                        try:
                            image_path, thumb_image, prev_ext, prev_mt = cpu_fut.result()
                        except Exception as exc:
                            logger.error("salvage CPU page %d failed: %s", page_num, exc)
                            continue
                        io_futures[io_pool.submit(
                            _upload_page_io,
                            prefix=prefix, page=page_num,
                            image_path=image_path, thumb_image=thumb_image,
                            preview_ext=prev_ext, preview_media_type=prev_mt,
                        )] = (page_num, image_path, thumb_image, prev_mt)

                    for io_fut in _completed_or_timed_out(
                        io_futures,
                        timeout_seconds=_future_timeout(len(io_futures), phase='io'),
                        label='salvage IO phase',
                    ):
                        page_num, image_path, thumb_image, prev_mt = io_futures[io_fut]
                        try:
                            prev_sp, thumb_sp = io_fut.result()
                            _record_page(
                                db, asset_id=asset_id, job_id=job_id, page=page_num,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_storage=prev_sp, thumb_storage=thumb_sp,
                                preview_media_type=prev_mt,
                            )
                        except Exception as exc:
                            logger.error("salvage IO/record page %d failed: %s", page_num, exc)
                            continue

                        page_storage[page_num] = (prev_sp, thumb_sp)
                        completed_pages.add(page_num)
                        files_created.append({'kind': 'preview_page', 'page': page_num, 'storage_path': prev_sp})
                        files_created.append({'kind': 'thumbnail_page', 'page': page_num, 'storage_path': thumb_sp})

                if salvage_evt is not None:
                    job_event_repo.finish(
                        db, salvage_evt.id,
                        metadata={'recovered': sorted(completed_pages & set(salvage_missing))},
                            message='Salvage pass complete',
                    )
            elif renderer_terminal_missing:
                logger.warning(
                    "generate_previews: skipping salvage for renderer-terminal pages asset=%s pages=%s",
                    asset_id, sorted(renderer_terminal_missing),
                )


            # ─── Verify & finalise ─────────────────────────────────────
            # Cross-check in-memory completed_pages against derived_files
            # so a page recorded by a retry / fan-out worker that landed
            # outside this process is not incorrectly flagged missing.
            try:
                db_present = derived_file_repo.pages_present_both(db, asset_id)
                if db_present:
                    completed_pages |= (db_present & expected_pages)
            except Exception as _verify_exc:
                logger.warning("generate_previews: db verify failed: %s", _verify_exc)
            still_missing = sorted(expected_pages - completed_pages)

            logger.info(
                "generate_previews: asset=%s rendered=%d/%d missing=%s timings_ms=%s",
                asset_id, len(completed_pages), page_count, still_missing, timings,
            )

            if still_missing:
                raster_missing = [p for p in still_missing if p not in local_rasterized_pages]
                record_missing = [p for p in still_missing if p in local_rasterized_pages]
                msg = (
                    f"Incomplete render: {len(still_missing)} of {page_count} "
                    f"page(s) missing → {still_missing}; "
                    f"raster_missing={raster_missing}; record_missing={record_missing}"
                )
                job_repo.mark_failed(db, job_id, msg)
                if evt_overall:
                    try:
                        job_event_repo.fail(
                            db, evt_overall.id,
                            message=msg,
                            metadata={
                                'missing_pages': still_missing,
                                'raster_missing': raster_missing,
                                'record_missing': record_missing,
                                'record_missing_errors': {
                                    str(p): record_missing_errors.get(p)
                                    for p in record_missing
                                },
                            },
                        )
                    except Exception:
                        pass
                    evt_overall = None
                # Asset is intentionally NOT marked 'ready' — keep it at
                # whatever it was before so the frontend won't surface
                # half-rendered previews. The render-pages endpoint can
                # recover the gaps later.
                raise NonRetryableTaskError(msg)

            asset_repo.update_asset(db, asset_id, {
                'thumbnail_storage_path': thumb_path or (page_storage.get(1, (None, None))[1]),
                'preview_storage_path': preview_path or (page_storage.get(1, (None, None))[0]),
                'status': 'ready',
            })
            pages_rendered = len(completed_pages)
            job_repo.mark_done(db, job_id, {
                'thumbnail_storage_path': thumb_path,
                'preview_storage_path': preview_path,
                'pages_rendered': pages_rendered,
                'expected_pages': page_count,
                'files_created': files_created[:20],
                'timings_ms': timings,
                'render_context': render_context,
            })
            if evt_overall:
                job_event_repo.finish(
                    db,
                    evt_overall.id,
                    metadata={'pages_rendered': pages_rendered, 'expected': page_count, 'timings_ms': timings, 'render_context': render_context},
                    message=f'Rendered {pages_rendered} of {page_count} page(s)',
                )
                evt_overall = None
            return {'pages_rendered': pages_rendered, 'expected_pages': page_count}
    except NonRetryableTaskError:
        raise
    except Exception as exc:
        if evt_overall:
            try:
                job_event_repo.fail(db, evt_overall.id, message=str(exc))
            except Exception:
                pass
        # mark_failed is idempotent — safe even if we already called it above.
        try:
            job_repo.mark_failed(db, job_id, traceback.format_exc())
        except Exception:
            pass
        raise exc
    finally:
        db.close()


@shared_task(bind=True, queue='thumbnails', soft_time_limit=300, time_limit=360)
def render_specific_pages(self, asset_id: str, job_id: str, pages: list[int]):
    """Re-render a specific set of pages for an existing asset.

    Used by the new ``POST /v1/assets/{id}/render-pages`` endpoint so the
    frontend can self-heal gaps without re-uploading the source. The page
    pipeline reuses the same retry-and-record helpers as
    ``generate_previews`` and the derived_files writes are idempotent.
    """
    db = _db()
    evt_overall = None
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        prefix = _tenant_prefix(asset.get('source_storage_path'))
        src_path = asset['normalized_storage_path'] or asset['source_storage_path']
        page_count = asset.get('page_count') or 0

        # Sanitize the requested pages: positive ints in range, deduped.
        wanted = sorted({int(p) for p in pages if 1 <= int(p) <= max(1, page_count)})
        if not wanted:
            job_repo.mark_done(db, job_id, {'pages_rendered': 0, 'requested': []})
            return {'pages_rendered': 0, 'requested': []}

        evt_overall = job_event_repo.start(
            db,
            job_id=job_id,
            asset_id=asset_id,
            task_name='render_specific_pages',
            queue_name='thumbnails',
            worker_name=self.request.hostname if self.request else None,
            stage='render',
            metadata={'requested': wanted, 'page_count': page_count},
            message=f'Re-rendering {len(wanted)} page(s)…',
        )

        recovered: list[int] = []
        failed: list[int] = []
        timings: dict[str, int] = {}

        with Workspace() as ws:
            src = ws.path('input.pdf')
            _download_pdf_with_cache(src_path, src, asset_id=asset_id, timings=timings)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            # ── Render exactly the requested pages ────────────────────
            # Earlier versions called rasterize_pages_ghostscript_jpeg
            # with first=min(wanted), last=max(wanted), which re-rendered
            # the WHOLE range — including pages we never asked for and that
            # were already on disk from the original generate_previews run.
            # On an 8-page doc with page 5 missing that meant re-rendering
            # pages 1..8 just to recover page 5, which is what produced the
            # "stuck at 7/8 → Recovering pages 5..8 forever" loop because
            # a long single-page recovery still has to do all the unrelated
            # work first.
            #
            # Recovery now renders and records ONE page at a time. That keeps
            # manual recovery deterministic too: page N cannot race page N+1.
            batch_dir = preview_dir / 'batch'
            batch_dir.mkdir(parents=True, exist_ok=True)
            preview_ext = 'jpg'
            preview_media_type = 'image/jpeg'

            t_raster = time.monotonic()
            for pn in wanted:
                phase = 'raster'
                try:
                    image_path = _retry_with_backoff(
                        lambda pn=pn: pdf_ops.rasterize_one_page_ghostscript_jpeg(
                            src, batch_dir / 'page',
                            dpi=settings.preview_dpi, page=pn,
                            quality=settings.preview_jpeg_quality,
                            timeout_seconds=max(
                                30.0,
                                float(getattr(settings, 'preview_gs_page_timeout_seconds', 20) or 20),
                            ),
                        ),
                        label='render_specific_rasterize_page', page=pn,
                    )
                    if not _valid_local_image(image_path):
                        raise RuntimeError('rendered preview image is missing or invalid')

                    phase = 'thumbnail'
                    thumb_image = thumb_dir / f"page-{pn:03d}.png"
                    _retry_with_backoff(
                        lambda: pdf_ops.downscale_to_thumbnail(image_path, thumb_image, 360),
                        label='render_specific_downscale_thumbnail', page=pn,
                    )
                    if not _valid_local_image(thumb_image):
                        raise RuntimeError('thumbnail image is missing or invalid')

                    phase = 'upload_preview'
                    preview_storage = unique_name(f'{prefix}previews/page-{pn:03d}', f'.{preview_ext}')
                    _retry_with_backoff(
                        lambda: storage.upload(image_path, preview_storage, preview_media_type),
                        label='render_specific_upload_preview', page=pn,
                    )

                    phase = 'upload_thumbnail'
                    thumb_storage = unique_name(f'{prefix}thumbnails/page-{pn:03d}', '.png')
                    _retry_with_backoff(
                        lambda: storage.upload(thumb_image, thumb_storage, 'image/png'),
                        label='render_specific_upload_thumbnail', page=pn,
                    )

                    phase = 'record'
                    _retry_with_backoff(
                        lambda: _record_page_sequential(
                            db,
                            asset_id=asset_id,
                            job_id=job_id,
                            page=pn,
                            image_path=image_path,
                            thumb_image=thumb_image,
                            preview_storage=preview_storage,
                            thumb_storage=thumb_storage,
                            preview_media_type=preview_media_type,
                        ),
                        label='render_specific_record_page', page=pn,
                    )
                    recovered.append(pn)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "render_specific_pages: page %d failed during %s: %s",
                        pn, phase, exc,
                    )
                    failed.append(pn)
            timings['per_page_render_ms'] = int((time.monotonic() - t_raster) * 1000)
            timings['per_page_failed'] = len(failed)

        # If the asset now has every page, promote it back to 'ready'.
        present_previews = derived_file_repo.pages_present(db, asset_id, 'preview_page')
        present_thumbs = derived_file_repo.pages_present(db, asset_id, 'thumbnail_page')
        full_set = set(range(1, page_count + 1)) if page_count else set()
        if full_set and full_set.issubset(present_previews) and full_set.issubset(present_thumbs):
            asset_repo.update_asset(db, asset_id, {'status': 'ready'})

        result = {
            'requested': wanted,
            'recovered': recovered,
            'failed': failed,
            'pages_rendered': len(recovered),
            'timings_ms': timings,
        }
        if failed:
            msg = f"Failed to re-render {len(failed)} page(s): {failed}"
            job_repo.mark_failed(db, job_id, msg)
            if evt_overall:
                job_event_repo.fail(db, evt_overall.id, message=msg)
                evt_overall = None
            raise RuntimeError(msg)

        job_repo.mark_done(db, job_id, result)
        if evt_overall:
            job_event_repo.finish(
                db, evt_overall.id,
                metadata=result,
                message=f'Re-rendered {len(recovered)}/{len(wanted)} page(s)',
            )
            evt_overall = None
        return result
    except Exception as exc:
        if evt_overall:
            try:
                job_event_repo.fail(db, evt_overall.id, message=str(exc))
            except Exception:
                pass
        try:
            job_repo.mark_failed(db, job_id, traceback.format_exc())
        except Exception:
            pass
        raise exc
    finally:
        db.close()
