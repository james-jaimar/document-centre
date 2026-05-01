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
    """
    Rotate every page by `angle` degrees, then bake the /Rotate hint into
    page geometry so downstream rasterizers cannot disagree about the visible
    canvas. The result is PROMOTED to asset.normalized_storage_path so all
    subsequent operations (generate-previews, print-ready, etc.) read the
    rotated PDF — not the pre-rotation source.

    Without this promotion the next preview render reads the original
    (unrotated) PDF and the UI keeps showing the old orientation.
    """
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)

            # Step 1: apply the /Rotate hint.
            rotated = ws.path('rotated.pdf')
            pdf_ops.rotate(src, out_pdf=rotated, angle=angle)

            # Step 2: bake the rotation into geometry so the rendered MediaBox
            # matches the visible content (no residual /Rotate hint).
            out_pdf = ws.path('rotated_baked.pdf')
            # dominant='landscape' means "landscape pages stay portrait pages
            # rotate" — but for a baked rotate we use a no-op dominant and
            # rely on transfer_rotation_to_content via normalize_orientation
            # with skip path. Easiest: re-write through normalize_orientation
            # with a dominant that matches whichever the rotated page already
            # is, so it doesn't double-rotate but DOES bake.
            try:
                # Inspect to decide dominant that won't trigger extra rotation.
                info = pdf_ops.inspect(rotated)
                w = float(info.get('width_pt') or 0)
                h = float(info.get('height_pt') or 0)
                dominant = 'landscape' if w >= h else 'portrait'
                pdf_ops.normalize_orientation(rotated, out_pdf, dominant=dominant)
            except Exception:
                # Bake step is best-effort; fall back to the rotated file.
                out_pdf = rotated

            # Step 3: promote as the new normalised PDF + refresh metadata.
            storage_path = unique_name(f'{prefix}derived/rotated', '.pdf')
            storage.upload(out_pdf, storage_path, 'application/pdf')

            derived_file_repo.create_file(
                db,
                asset_id=asset_id,
                job_id=job_id,
                kind='rotated_pdf',
                storage_path=storage_path,
                media_type='application/pdf',
                metadata={'angle': angle},
            )

            info = pdf_ops.inspect(out_pdf)
            asset_repo.update_asset(db, asset_id, {
                'normalized_storage_path': storage_path,
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'boxes': info['boxes'],
                # Wipe top-level page-1 pointers so generate-previews has to
                # re-populate them from the rotated PDF. Otherwise the legacy
                # asset.thumbnail_storage_path can still point at a pre-rotation
                # render and the frontend fallback picks it up.
                'thumbnail_storage_path': None,
                'preview_storage_path': None,
            })

            # Drop every preview_page / thumbnail_page row for this asset.
            # The next generate-previews pass writes fresh rows. Without this
            # the picker can resurface a pre-rotation thumbnail of the wrong
            # orientation.
            removed = derived_file_repo.clear_page_renders(db, asset_id)

            result = {
                'storage_path': storage_path,
                'normalized_storage_path': storage_path,
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'angle': angle,
                'cleared_page_renders': removed,
            }
            job_repo.mark_done(db, job_id, result)
            return result
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
    """
    Resize all pages onto the requested target canvas, then PROMOTE the
    output to asset.normalized_storage_path so downstream operations
    (normalize-orientation, print-ready, generate-previews) operate on the
    resized PDF — not the pre-resize source. Without this promotion the
    preview pipeline keeps reading the LibreOffice output and any
    mixed-orientation pages get rendered with a stale page-1 box.
    """
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path('resized.pdf')
            pdf_ops.resize_pages(src, out_pdf, width_mm, height_mm, fit_mode)

            storage_path = unique_name(f'{prefix}derived/resized', '.pdf')
            storage.upload(out_pdf, storage_path, 'application/pdf')

            derived_file_repo.create_file(
                db,
                asset_id=asset_id,
                job_id=job_id,
                kind='resized_pdf',
                storage_path=storage_path,
                media_type='application/pdf',
                metadata={'width_mm': width_mm, 'height_mm': height_mm, 'fit_mode': fit_mode},
            )

            info = pdf_ops.inspect(out_pdf)
            asset_repo.update_asset(db, asset_id, {
                'normalized_storage_path': storage_path,
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'boxes': info['boxes'],
                'thumbnail_storage_path': None,
                'preview_storage_path': None,
            })
            removed = derived_file_repo.clear_page_renders(db, asset_id)

            result = {
                'storage_path': storage_path,
                'normalized_storage_path': storage_path,
                'page_count': info['page_count'],
                'width_pt': info['width_pt'],
                'height_pt': info['height_pt'],
                'width_mm': width_mm,
                'height_mm': height_mm,
                'fit_mode': fit_mode,
                'cleared_page_renders': removed,
            }
            job_repo.mark_done(db, job_id, result)
            return result
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

# ---------------------------------------------------------------------------
# Office → PDF conversion
# ---------------------------------------------------------------------------
# Contract: POST /v1/operations/convert-office { asset_id } -> { job_id }
# Worker:
#   1. Download source Office file (asset.source_storage_path) to workspace.
#   2. soffice --headless --convert-to pdf  (with isolated UserInstallation).
#   3. Upload converted PDF to S3 under <tenant_prefix>derived/converted/.
#   4. Register a derived_file with kind='converted_pdf'.
#   5. Promote: set asset.normalized_storage_path + recomputed page_count /
#      width_pt / height_pt / boxes / status='normalized'.
#   6. Mark job done. Client then calls /assets/{id}/inspect (idempotent) and
#      the rest of the standard PDF pipeline runs against the converted PDF.

OFFICE_MIME_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.oasis.opendocument.spreadsheet",
    # Excel kept tolerant in case it ever shows up:
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

OFFICE_EXTENSIONS = {
    ".doc", ".docx",
    ".ppt", ".pptx",
    ".odt", ".odp", ".ods",
    ".xls", ".xlsx",
    ".rtf",
}


@shared_task(bind=True, queue="documents")
def convert_office(self, asset_id: str, job_id: str):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        if not asset:
            raise ValueError(f"Asset not found: {asset_id}")

        media_type = (asset.get("media_type") or "").lower()
        original_filename = asset.get("original_filename") or "document"
        ext = Path(original_filename).suffix.lower()

        if media_type not in OFFICE_MIME_TYPES and ext not in OFFICE_EXTENSIONS:
            raise ValueError(
                f"Asset {asset_id} is not a supported office file "
                f"(media_type={media_type!r}, ext={ext!r})"
            )

        prefix = _tenant_prefix(asset.get("source_storage_path"))

        with Workspace() as ws:
            # 1) Download original office file
            src_name = original_filename if ext else f"{asset_id}{ext or '.bin'}"
            src = ws.path(src_name)
            storage.download(asset["source_storage_path"], src)

            # 2) Convert with LibreOffice
            converted = pdf_ops.office_to_pdf(src, ws.path("converted"))

            # 3) Upload converted PDF
            storage_path = unique_name(f"{prefix}derived/converted", ".pdf")
            storage.upload(converted, storage_path, "application/pdf")

            # 4) Register derived file
            derived_file_repo.create_file(
                db,
                asset_id=asset_id,
                job_id=job_id,
                kind="converted_pdf",
                storage_path=storage_path,
                media_type="application/pdf",
                metadata={"source_media_type": media_type, "source_ext": ext},
            )

            # 5) Inspect + promote to normalized
            info = pdf_ops.inspect(converted)
            asset_repo.update_asset(db, asset_id, {
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
                "width_pt": info["width_pt"],
                "height_pt": info["height_pt"],
                "boxes": info["boxes"],
                "status": "normalized",
            })

            # 6) Done
            result = {
                "storage_path": storage_path,
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
                "width_pt": info["width_pt"],
                "height_pt": info["height_pt"],
            }
            job_repo.mark_done(db, job_id, result)
            return result

    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Mixed-orientation normalisation
# ---------------------------------------------------------------------------
# Contract: POST /v1/operations/normalize-orientation
#   { asset_id, dominant: "portrait"|"landscape" } -> { job_id }
#
# Worker:
#   1. Download the asset's PDF (normalized → falls back to source).
#   2. Rotate any pages whose orientation doesn't match `dominant`
#      by 90° CLOCKWISE (client convention: CW).
#   3. If at least one page rotated, upload the new PDF and promote it to
#      asset.normalized_storage_path, recomputing inspect metadata.
#      If nothing rotated, skip the upload — job result reports skipped=true.
@shared_task(bind=True, queue="default")
def normalize_orientation(self, asset_id: str, job_id: str, dominant: str = "portrait"):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        prefix = _get_asset_prefix(db, asset_id)
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path("oriented.pdf")
            stats = pdf_ops.normalize_orientation(src, out_pdf, dominant=dominant)

            if stats["skipped"]:
                # Nothing changed — no upload, no promotion.
                job_repo.mark_done(db, job_id, stats)
                return stats

            storage_path = unique_name(f"{prefix}derived/oriented", ".pdf")
            storage.upload(out_pdf, storage_path, "application/pdf")

            derived_file_repo.create_file(
                db,
                asset_id=asset_id,
                job_id=job_id,
                kind="oriented_pdf",
                storage_path=storage_path,
                media_type="application/pdf",
                metadata={"dominant": dominant, **stats},
            )

            info = pdf_ops.inspect(out_pdf)
            asset_repo.update_asset(db, asset_id, {
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
                "width_pt": info["width_pt"],
                "height_pt": info["height_pt"],
                "boxes": info["boxes"],
                "thumbnail_storage_path": None,
                "preview_storage_path": None,
            })
            removed = derived_file_repo.clear_page_renders(db, asset_id)

            result = {
                **stats,
                "storage_path": storage_path,
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
                "width_pt": info["width_pt"],
                "height_pt": info["height_pt"],
                "cleared_page_renders": removed,
            }
            job_repo.mark_done(db, job_id, result)
            return result

    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Print-ready CMYK conversion
# ---------------------------------------------------------------------------
# Contract: POST /v1/operations/print-ready
#   { asset_id, intent, dest_profile } -> { job_id }
#
# Worker:
#   1. Download the asset's PDF (normalized → falls back to source).
#   2. Idempotency: if asset.metadata.print_ready_profile == dest_profile,
#      skip the conversion (job result reports skipped=true).
#   3. Run pdf_ops.to_print_ready_cmyk with the chosen profile + intent.
#   4. Upload the result and promote it to asset.normalized_storage_path,
#      recording { print_ready_profile, print_ready_intent } in metadata.
#   5. Re-inspect to refresh page count / dimensions.
@shared_task(bind=True, queue="documents")
def print_ready(
    self,
    asset_id: str,
    job_id: str,
    intent: str = "relative_colorimetric",
    dest_profile: str = "fogra39",
    chain_generate_previews: bool = False,
    chain_render_box: list[float] | None = None,
    chain_job_id: str | None = None,
):
    db = _db()
    try:
        job_repo.mark_running(db, job_id)
        asset = asset_repo.get_asset(db, asset_id)
        if not asset:
            raise ValueError(f"Asset not found: {asset_id}")

        existing_meta = asset.get("metadata") or {}
        if existing_meta.get("print_ready_profile") == dest_profile and \
           existing_meta.get("print_ready_intent") == intent:
            result = {"skipped": True, "reason": "already_print_ready",
                      "dest_profile": dest_profile, "intent": intent}
            job_repo.mark_done(db, job_id, result)
            return result

        prefix = _tenant_prefix(asset.get("source_storage_path"))
        with Workspace() as ws:
            src = _download_asset_pdf(db, asset_id, ws)
            out_pdf = ws.path("print-ready.pdf")
            # Note: we deliberately do NOT catch FileNotFoundError /
            # ValueError from to_print_ready_cmyk here. A missing ICC
            # profile is a server misconfiguration — silently skipping
            # used to mask the issue for weeks. Let it bubble so the job
            # is marked failed and the platform Workers UI surfaces it.
            # Fix: install profiles via scripts/install-icc-profiles.sh.
            stats = pdf_ops.to_print_ready_cmyk(
                src, out_pdf,
                dest_profile=dest_profile,
                intent=intent,
                preserve_black=True,
            )


            storage_path = unique_name(f"{prefix}derived/print-ready", ".pdf")
            storage.upload(out_pdf, storage_path, "application/pdf")

            derived_file_repo.create_file(
                db,
                asset_id=asset_id,
                job_id=job_id,
                kind="print_ready_pdf",
                storage_path=storage_path,
                media_type="application/pdf",
                metadata=stats,
            )

            info = pdf_ops.inspect(out_pdf)
            new_meta = {
                **existing_meta,
                "print_ready_profile": dest_profile,
                "print_ready_intent": intent,
            }
            asset_repo.update_asset(db, asset_id, {
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
                "width_pt": info["width_pt"],
                "height_pt": info["height_pt"],
                "boxes": info["boxes"],
                "metadata": new_meta,
            })

            result = {
                **stats,
                "storage_path": storage_path,
                "normalized_storage_path": storage_path,
                "page_count": info["page_count"],
            }
            job_repo.mark_done(db, job_id, result)
            return result

    except Exception as exc:
        job_repo.mark_failed(db, job_id, traceback.format_exc())
        raise exc
    finally:
        db.close()
