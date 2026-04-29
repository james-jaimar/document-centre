from __future__ import annotations
import logging
logger = logging.getLogger(__name__)
import random
import time
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
from app.services.pdf_ops import pdf_ops, RasterizationIncompleteError
from app.services.derived_files import derived_file_repo
from app.core.config import settings

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
            task = generate_previews.delay(asset_id, preview_job_id, default_render_box)
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

    Each step is retried independently so a transient S3 hiccup doesn't
    cause a full re-rasterise of the page. Returns
    ``(image_path, thumb_image, preview_storage, thumb_storage)``.

    Per-page output isolation: each call writes to its own subdirectory
    so concurrent ThreadPoolExecutor workers can never overwrite each
    other's intermediate files (Ghostscript's old default sequential
    output naming caused parallel workers to clobber ``page-001.png``
    repeatedly, producing wrong-content uploads and "incomplete render"
    failures for every page after the first).
    """
    page_preview_dir = preview_dir / f"p{page:03d}"
    page_thumb_dir = thumb_dir / f"p{page:03d}"
    page_preview_dir.mkdir(parents=True, exist_ok=True)
    page_thumb_dir.mkdir(parents=True, exist_ok=True)
    out_prefix = page_preview_dir / 'page'

    def _do_rasterize():
        imgs = pdf_ops.rasterize_preview(
            src_pdf, out_prefix, dpi=dpi,
            first_page=page, last_page=page,
        )
        # _gs_rasterize_pages now writes directly to <prefix>-<page>.png
        # for single-page renders, so this is the canonical target.
        target = page_preview_dir / f"page-{page:03d}.png"
        if not target.exists():
            # Defensive fallback in case future changes alter the naming.
            for img in imgs:
                if img.stem.endswith(f"-{page:03d}"):
                    target = img
                    break
        if not target.exists():
            raise RuntimeError(f"rasterize produced no file for page {page}")
        return target

    image_path = _retry_with_backoff(
        _do_rasterize, label='rasterize_one_page', page=page,
    )

    def _do_downscale():
        thumb_image = page_thumb_dir / f"page-{page:03d}.png"
        pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)
        return thumb_image

    thumb_image = _retry_with_backoff(
        _do_downscale, label='downscale_thumbnail', page=page,
    )

    preview_storage = unique_name(f'{prefix}previews/page-{page:03d}', '.png')
    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page:03d}', '.png')

    _retry_with_backoff(
        lambda: storage.upload(image_path, preview_storage, 'image/png'),
        label='upload_preview', page=page,
    )
    _retry_with_backoff(
        lambda: storage.upload(thumb_image, thumb_storage, 'image/png'),
        label='upload_thumbnail', page=page,
    )

    return image_path, thumb_image, preview_storage, thumb_storage


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

    Returns (image_path, thumb_image). Each call writes into its own
    per-page subdir so concurrent workers can never overwrite each
    other's intermediate files.
    """
    page_preview_dir = preview_dir / f"p{page:03d}"
    page_thumb_dir = thumb_dir / f"p{page:03d}"
    page_preview_dir.mkdir(parents=True, exist_ok=True)
    page_thumb_dir.mkdir(parents=True, exist_ok=True)
    out_prefix = page_preview_dir / 'page'

    def _do_rasterize():
        pdf_ops.rasterize_preview(
            src_pdf, out_prefix, dpi=dpi,
            first_page=page, last_page=page,
        )
        target = page_preview_dir / f"page-{page:03d}.png"
        if not target.exists():
            raise RuntimeError(f"rasterize produced no file for page {page}")
        return target

    image_path = _retry_with_backoff(
        _do_rasterize, label='rasterize_one_page', page=page,
    )

    def _do_downscale():
        thumb_image = page_thumb_dir / f"page-{page:03d}.png"
        pdf_ops.downscale_to_thumbnail(image_path, thumb_image, target_max_dim=360)
        return thumb_image

    thumb_image = _retry_with_backoff(
        _do_downscale, label='downscale_thumbnail', page=page,
    )
    return image_path, thumb_image


def _upload_page_io(
    *,
    prefix: str,
    page: int,
    image_path,
    thumb_image,
):
    """IO-bound phase: upload preview + thumbnail to S3.

    Returns (preview_storage, thumb_storage). DB writes happen in the
    main thread after this returns so we don't fight SQLAlchemy session
    threadsafety rules.
    """
    preview_storage = unique_name(f'{prefix}previews/page-{page:03d}', '.png')
    thumb_storage = unique_name(f'{prefix}thumbnails/page-{page:03d}', '.png')

    _retry_with_backoff(
        lambda: storage.upload(image_path, preview_storage, 'image/png'),
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
):
    """Idempotently record both derived_files rows for a page."""
    _retry_with_backoff(
        lambda: _record_preview(
            db, asset_id, job_id, 'preview_page', preview_storage,
            image_path, page=page, size_label='preview',
        ),
        label='db_record_preview', page=page,
    )
    _retry_with_backoff(
        lambda: _record_preview(
            db, asset_id, job_id, 'thumbnail_page', thumb_storage,
            thumb_image, page=page, size_label='thumbnail',
        ),
        label='db_record_thumbnail', page=page,
    )


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

            image_path, thumb_image, prev_sp, thumb_sp = _render_one_page(
                src_pdf=src, preview_dir=preview_dir, thumb_dir=thumb_dir,
                prefix=prefix, page=page, dpi=dpi,
            )
            _record_page(
                db, asset_id=asset_id, job_id=job_id, page=page,
                image_path=image_path, thumb_image=thumb_image,
                preview_storage=prev_sp, thumb_storage=thumb_sp,
            )
            return {'page': page, 'preview_storage_path': prev_sp, 'thumbnail_storage_path': thumb_sp}
    except Exception as exc:
        logger.warning("render_one_page: page %d failed: %s", page, exc)
        # Don't mark the parent job failed — the parent watches the
        # derived_files table and will salvage missing pages itself.
        raise
    finally:
        db.close()


@shared_task(bind=True, queue='thumbnails')
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
    db = _db()
    evt_overall = None
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
            metadata={'page_count': page_count, 'dpi': settings.preview_dpi},
            message=f'Rendering {page_count or "?"} page(s)…',
        )

        with Workspace() as ws:
            src = ws.path('input.pdf')
            storage.download(src_path, src)

            # If caller didn't specify a render_box, auto-derive one from
            # the PDF's own TrimBox/BleedBox so previews show the finished
            # page edge (no bleed margin / crop marks). This protects against
            # callers that pass `null` after rotate/resize/print-ready.
            effective_render_box = render_box
            if effective_render_box is None:
                try:
                    effective_render_box = pdf_ops.derive_default_render_box(src)
                except Exception as exc:
                    logger.warning(
                        "generate_previews: derive_default_render_box failed: %s", exc,
                    )
                    effective_render_box = None

            if effective_render_box is not None:
                cropped = ws.path('cropped.pdf')
                pdf_ops.crop_to_box(src, cropped, effective_render_box)
                src = cropped

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

            # ─── Page-1 fast path ──────────────────────────────────────
            try:
                image_path, thumb_image, prev_sp, thumb_sp = _render_one_page(
                    src_pdf=src, preview_dir=preview_dir, thumb_dir=thumb_dir,
                    prefix=prefix, page=1, dpi=settings.preview_dpi,
                )
                _record_page(
                    db, asset_id=asset_id, job_id=job_id, page=1,
                    image_path=image_path, thumb_image=thumb_image,
                    preview_storage=prev_sp, thumb_storage=thumb_sp,
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

            # ─── Two-pool parallel pass for remaining pages ────────────
            # CPU pool (small, ≈ cpu_count-1) runs Ghostscript + downscale.
            # IO pool (wider, default 8) runs S3 uploads. Pages stream from
            # CPU → IO so the next page rasterises while the previous one
            # uploads; DB writes are serialised on the main thread to keep
            # SQLAlchemy sessions safe.
            if page_count and page_count > 1:
                remaining = [p for p in range(2, page_count + 1) if p not in completed_pages]

                cpu_workers = max(1, settings.render_cpu_concurrency)
                io_workers = max(1, settings.render_io_concurrency)
                logger.info(
                    "generate_previews: parallel pass pages=%d cpu_pool=%d io_pool=%d",
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

                    # Hand each finished CPU job to the IO pool immediately.
                    io_futures: dict = {}
                    for cpu_fut in as_completed(cpu_futures):
                        page_num = cpu_futures[cpu_fut]
                        try:
                            image_path, thumb_image = cpu_fut.result()
                        except Exception as exc:
                            logger.warning(
                                "generate_previews: CPU phase page %d failed: %s",
                                page_num, exc,
                            )
                            job_event_repo.start(
                                db, job_id=job_id, asset_id=asset_id,
                                task_name='generate_previews', queue_name='thumbnails',
                                worker_name=self.request.hostname if self.request else None,
                                stage='page_failed',
                                metadata={'page': page_num, 'phase': 'cpu', 'error': str(exc)},
                                message=f'Page {page_num} render failed (will salvage): {exc}',
                            )
                            continue

                        io_fut = io_pool.submit(
                            _upload_page_io,
                            prefix=prefix, page=page_num,
                            image_path=image_path, thumb_image=thumb_image,
                        )
                        io_futures[io_fut] = (page_num, image_path, thumb_image)

                    for io_fut in as_completed(io_futures):
                        page_num, image_path, thumb_image = io_futures[io_fut]
                        try:
                            prev_sp, thumb_sp = io_fut.result()
                        except Exception as exc:
                            logger.warning(
                                "generate_previews: IO phase page %d failed: %s",
                                page_num, exc,
                            )
                            job_event_repo.start(
                                db, job_id=job_id, asset_id=asset_id,
                                task_name='generate_previews', queue_name='thumbnails',
                                worker_name=self.request.hostname if self.request else None,
                                stage='page_failed',
                                metadata={'page': page_num, 'phase': 'io', 'error': str(exc)},
                                message=f'Page {page_num} upload failed (will salvage): {exc}',
                            )
                            continue

                        try:
                            _record_page(
                                db, asset_id=asset_id, job_id=job_id, page=page_num,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_storage=prev_sp, thumb_storage=thumb_sp,
                            )
                        except Exception as exc:
                            logger.warning(
                                "generate_previews: DB record failed for page %d: %s",
                                page_num, exc,
                            )
                            continue

                        page_storage[page_num] = (prev_sp, thumb_sp)
                        completed_pages.add(page_num)
                        completed_count += 1
                        files_created.append({'kind': 'preview_page', 'page': page_num, 'storage_path': prev_sp})
                        files_created.append({'kind': 'thumbnail_page', 'page': page_num, 'storage_path': thumb_sp})

                        if completed_count % 5 == 0 or completed_count == page_count:
                            page_evt = job_event_repo.start(
                                db, job_id=job_id, asset_id=asset_id,
                                task_name='generate_previews', queue_name='thumbnails',
                                worker_name=self.request.hostname if self.request else None,
                                stage='page_batch',
                                metadata={'rendered': completed_count, 'total': page_count},
                                message=f'Rendered {completed_count} of {page_count} pages',
                            )
                            if page_evt is not None:
                                job_event_repo.finish(db, page_evt.id, message='', metadata={'rendered': completed_count, 'total': page_count})

            # ─── Salvage pass: small two-pool retry for any still-missing
            # Salvage runs with tiny pools (cpu=2, io=2) — by definition the
            # unhappy path, but still wildly faster than the old fully
            # sequential loop (we saw a 247 s salvage in production).
            missing = sorted(expected_pages - completed_pages)
            if missing and settings.preview_salvage_enabled:
                logger.warning(
                    "generate_previews: salvage pass for asset=%s pages=%s",
                    asset_id, missing,
                )
                salvage_evt = job_event_repo.start(
                    db, job_id=job_id, asset_id=asset_id,
                    task_name='generate_previews', queue_name='thumbnails',
                    worker_name=self.request.hostname if self.request else None,
                    stage='salvage',
                    metadata={'missing': missing},
                    message=f'Salvaging {len(missing)} missing page(s)…',
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
                        for p in missing
                    }
                    io_futures = {}
                    for cpu_fut in as_completed(cpu_futures):
                        page_num = cpu_futures[cpu_fut]
                        try:
                            image_path, thumb_image = cpu_fut.result()
                        except Exception as exc:
                            logger.error("salvage CPU page %d failed: %s", page_num, exc)
                            continue
                        io_futures[io_pool.submit(
                            _upload_page_io,
                            prefix=prefix, page=page_num,
                            image_path=image_path, thumb_image=thumb_image,
                        )] = (page_num, image_path, thumb_image)

                    for io_fut in as_completed(io_futures):
                        page_num, image_path, thumb_image = io_futures[io_fut]
                        try:
                            prev_sp, thumb_sp = io_fut.result()
                            _record_page(
                                db, asset_id=asset_id, job_id=job_id, page=page_num,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_storage=prev_sp, thumb_storage=thumb_sp,
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
                        metadata={'recovered': sorted(completed_pages & set(missing))},
                        message='Salvage pass complete',
                    )


            # ─── Verify & finalise ─────────────────────────────────────
            still_missing = sorted(expected_pages - completed_pages)

            logger.info(
                "generate_previews: asset=%s rendered=%d/%d missing=%s",
                asset_id, len(completed_pages), page_count, still_missing,
            )

            if still_missing:
                msg = (
                    f"Incomplete render: {len(still_missing)} of {page_count} "
                    f"page(s) missing → {still_missing}"
                )
                job_repo.mark_failed(db, job_id, msg)
                if evt_overall:
                    try:
                        job_event_repo.fail(db, evt_overall.id, message=msg)
                    except Exception:
                        pass
                    evt_overall = None
                # Asset is intentionally NOT marked 'ready' — keep it at
                # whatever it was before so the frontend won't surface
                # half-rendered previews. The render-pages endpoint can
                # recover the gaps later.
                raise RuntimeError(msg)

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
            })
            if evt_overall:
                job_event_repo.finish(
                    db,
                    evt_overall.id,
                    metadata={'pages_rendered': pages_rendered, 'expected': page_count},
                    message=f'Rendered {pages_rendered} of {page_count} page(s)',
                )
                evt_overall = None
            return {'pages_rendered': pages_rendered, 'expected_pages': page_count}
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


@shared_task(bind=True, queue='thumbnails')
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

        with Workspace() as ws:
            src = ws.path('input.pdf')
            storage.download(src_path, src)

            preview_dir = ws.path('preview')
            thumb_dir = ws.path('thumb')
            preview_dir.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)

            for page_num in wanted:
                try:
                    image_path, thumb_image, prev_sp, thumb_sp = _render_one_page(
                        src_pdf=src, preview_dir=preview_dir, thumb_dir=thumb_dir,
                        prefix=prefix, page=page_num, dpi=settings.preview_dpi,
                    )
                    _record_page(
                        db, asset_id=asset_id, job_id=job_id, page=page_num,
                        image_path=image_path, thumb_image=thumb_image,
                        preview_storage=prev_sp, thumb_storage=thumb_sp,
                    )
                    recovered.append(page_num)
                except Exception as exc:
                    logger.error(
                        "render_specific_pages: page %d failed: %s",
                        page_num, exc,
                    )
                    failed.append(page_num)

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
        }
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
