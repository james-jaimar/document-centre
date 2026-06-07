from __future__ import annotations
import logging
import os
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
from app.core.queue import enqueue

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

        timings: dict[str, int] = {}

        def _stamp(label: str, t_start: float) -> None:
            timings[label] = int((time.monotonic() - t_start) * 1000)

        with Workspace() as ws:
            src = ws.path('input.pdf')
            t_dl = time.monotonic()
            storage.download(src_path, src)
            _stamp('download_pdf', t_dl)

            # If caller didn't specify a render_box, auto-derive one from
            # the PDF's own TrimBox/BleedBox so previews show the finished
            # page edge (no bleed margin / crop marks). This protects against
            # callers that pass `null` after rotate/resize/print-ready.
            t_box = time.monotonic()
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

            # ─── Batch fast path (MuPDF → JPEG) ───────────────────────
            # ONE `mutool draw` invocation for the full page range, then
            # downscale + upload + record concurrently. MuPDF is 2–4×
            # faster than Ghostscript for "PDF → pixels" and writes
            # straight to JPEG q90 (no PNG re-encode round-trip).
            batch_threshold = max(1, settings.render_batch_threshold)
            batch_eligible = (
                page_count
                and page_count <= batch_threshold
                and page_count >= 1
            )
            preview_ext = 'jpg' if settings.preview_format == 'jpeg' else 'png'
            preview_media_type = 'image/jpeg' if settings.preview_format == 'jpeg' else 'image/png'
            if batch_eligible:
                t_batch = time.monotonic()
                try:
                    t_gs = time.monotonic()
                    pdf_ops.rasterize_pages_mutool(
                        src, preview_dir / 'page', dpi=settings.preview_dpi,
                        first_page=1, last_page=page_count,
                        fmt=settings.preview_format,
                        quality=settings.preview_jpeg_quality,
                    )
                    _stamp('mutool_batch', t_gs)
                    cpu_workers = max(1, settings.render_cpu_concurrency)
                    io_workers = max(1, settings.render_io_concurrency)
                    with ThreadPoolExecutor(max_workers=cpu_workers) as cpu_pool, \
                         ThreadPoolExecutor(max_workers=io_workers) as io_pool:
                        thumb_futures = {}
                        for p in range(1, page_count + 1):
                            image_path = preview_dir / f"page-{p:03d}.{preview_ext}"
                            if not image_path.exists():
                                continue
                            thumb_image = thumb_dir / f"page-{p:03d}.png"
                            thumb_futures[cpu_pool.submit(
                                pdf_ops.downscale_to_thumbnail,
                                image_path, thumb_image, 360,
                            )] = (p, image_path, thumb_image)

                        upload_futures = {}
                        for fut in as_completed(thumb_futures):
                            p, image_path, thumb_image = thumb_futures[fut]
                            try:
                                fut.result()
                            except Exception as exc:
                                logger.warning("batch downscale page %d failed: %s", p, exc)
                                continue
                            upload_futures[io_pool.submit(
                                _upload_page_io,
                                prefix=prefix, page=p,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_ext=preview_ext,
                                preview_media_type=preview_media_type,
                            )] = (p, image_path, thumb_image)

                        for fut in as_completed(upload_futures):
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
                                logger.warning("batch IO/record page %d failed: %s", p, exc)
                                continue
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
                    _stamp('batch_total', t_batch)
                    logger.info(
                        "generate_previews: batch path (mutool) rendered %d/%d pages in %sms",
                        len(completed_pages), page_count, timings.get('batch_total'),
                    )
                except Exception as exc:
                    logger.warning(
                        "generate_previews: batch path failed (will fall back): %s", exc,
                    )

            # ─── Page-1 fast path (skipped if batch already covered it) ─
            if 1 in completed_pages:
                pass
            else:
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
                remaining = [p for p in range(2, page_count + 1) if p not in completed_pages]

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
                        for cpu_fut in as_completed(cpu_futures):
                            page_num = cpu_futures[cpu_fut]
                            try:
                                image_path, thumb_image = cpu_fut.result()
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
                            )
                            io_futures[io_fut] = (page_num, image_path, thumb_image)

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
                'timings_ms': timings,
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

            # ── Batch path ────────────────────────────────────────────
            # Mirror generate_previews: ONE Ghostscript invocation across
            # the requested page range, then downscale + upload + record
            # in parallel via the existing CPU/IO thread pools. Avoids the
            # ~500ms–1s GS cold-start overhead that the previous per-page
            # loop paid for every missing page.
            batch_dir = preview_dir / 'batch'
            batch_dir.mkdir(parents=True, exist_ok=True)
            wanted_set = set(wanted)
            lo, hi = min(wanted), max(wanted)
            try:
                pdf_ops.rasterize_preview(
                    src, batch_dir / 'page', dpi=settings.preview_dpi,
                    first_page=lo, last_page=hi,
                )
            except Exception as exc:
                logger.warning(
                    "render_specific_pages: batch rasterize %d-%d failed, "
                    "falling back to per-page: %s", lo, hi, exc,
                )
                # Fallback: original per-page loop so we never regress
                # behaviour when the batch path explodes.
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
                    except Exception as inner:
                        logger.error(
                            "render_specific_pages: page %d failed: %s",
                            page_num, inner,
                        )
                        failed.append(page_num)
            else:
                cpu_workers = max(1, settings.render_cpu_concurrency)
                io_workers = max(1, settings.render_io_concurrency)
                with ThreadPoolExecutor(max_workers=cpu_workers) as cpu_pool, \
                     ThreadPoolExecutor(max_workers=io_workers) as io_pool:
                    thumb_futures = {}
                    for p in wanted:
                        image_path = batch_dir / f"page-{p:03d}.png"
                        if not image_path.exists():
                            failed.append(p)
                            continue
                        thumb_image = thumb_dir / f"page-{p:03d}.png"
                        thumb_futures[cpu_pool.submit(
                            pdf_ops.downscale_to_thumbnail,
                            image_path, thumb_image, 360,
                        )] = (p, image_path, thumb_image)

                    upload_futures = {}
                    for fut in as_completed(thumb_futures):
                        p, image_path, thumb_image = thumb_futures[fut]
                        try:
                            fut.result()
                        except Exception as exc:
                            logger.warning("recovery downscale page %d failed: %s", p, exc)
                            failed.append(p)
                            continue
                        upload_futures[io_pool.submit(
                            _upload_page_io,
                            prefix=prefix, page=p,
                            image_path=image_path, thumb_image=thumb_image,
                        )] = (p, image_path, thumb_image)

                    for fut in as_completed(upload_futures):
                        p, image_path, thumb_image = upload_futures[fut]
                        try:
                            prev_sp, thumb_sp = fut.result()
                            _record_page(
                                db, asset_id=asset_id, job_id=job_id, page=p,
                                image_path=image_path, thumb_image=thumb_image,
                                preview_storage=prev_sp, thumb_storage=thumb_sp,
                            )
                            recovered.append(p)
                        except Exception as exc:
                            logger.warning("recovery IO/record page %d failed: %s", p, exc)
                            failed.append(p)

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
