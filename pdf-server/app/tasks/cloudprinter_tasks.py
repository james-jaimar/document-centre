"""Cloudprinter render task for the printmypics (PMP) project.

PMP's Supabase edge functions can't decode/encode full-resolution phone
photos within their CPU/memory budget, so they offload the actual
Pillow rasterization to pdf-server. We:

  1. Download each source image from a short-lived signed S3 URL.
  2. Apply rotation + crop (croppedAreaPixels), then resize to the
     target pixel dimensions (swapping target W/H if orientation
     differs — Cloudprinter photo SKUs are portrait).
  3. Emit ``quantity`` copies of each job into a single ZIP for the
     whole request.
  4. Upload the ZIP to pdf-server's own S3 bucket, sign a long-lived
     GET URL, MD5 the ZIP bytes, and POST the callback to PMP.

Failures are reported via the callback — we never poison-queue, since
PMP owns retry from its admin UI.
"""
from __future__ import annotations

import hashlib
import io
import logging
import time
import traceback
import uuid
import zipfile
from typing import Any, Dict

import requests
from celery import shared_task
from PIL import Image

from app.services.files import Workspace
from app.services.storage import s3_client, S3_BUCKET

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 60
CALLBACK_TIMEOUT = 30
CALLBACK_MAX_ATTEMPTS = 3
SIGNED_URL_TTL = 3600  # 1h — Cloudprinter only fetches once


def _post_callback(callback_url: str, callback_token: str, body: Dict[str, Any]) -> None:
    last_exc: Exception | None = None
    for attempt in range(1, CALLBACK_MAX_ATTEMPTS + 1):
        try:
            resp = requests.post(
                callback_url,
                json=body,
                headers={
                    "Authorization": f"Bearer {callback_token}",
                    "Content-Type": "application/json",
                },
                timeout=CALLBACK_TIMEOUT,
            )
            if resp.status_code < 500:
                if resp.status_code >= 400:
                    logger.warning(
                        "cloudprinter callback rejected status=%s body=%s",
                        resp.status_code, resp.text[:500],
                    )
                return
            last_exc = RuntimeError(f"callback {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
        time.sleep(2 ** (attempt - 1))
    logger.error("cloudprinter callback failed after %d attempts: %s", CALLBACK_MAX_ATTEMPTS, last_exc)


def _render_one_job(job: Dict[str, Any]) -> bytes:
    """Download + transform a single source image; return JPEG bytes."""
    resp = requests.get(job["source_url"], stream=True, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content))
    img.load()

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    crop = job.get("crop") or None
    if crop:
        rotation = float(crop.get("rotation") or 0)
        if rotation:
            img = img.rotate(-rotation, expand=True, resample=Image.BICUBIC)
        area = crop.get("croppedAreaPixels")
        if area:
            x = max(0, int(area["x"]))
            y = max(0, int(area["y"]))
            w = max(1, int(area["width"]))
            h = max(1, int(area["height"]))
            x2 = min(img.width, x + w)
            y2 = min(img.height, y + h)
            img = img.crop((x, y, x2, y2))

    target_w = int(job["target_w_px"])
    target_h = int(job["target_h_px"])
    # Cloudprinter photo SKUs are portrait; swap target if cropped orientation differs.
    if (img.width > img.height) != (target_w > target_h):
        target_w, target_h = target_h, target_w

    img = img.resize((target_w, target_h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=int(job.get("jpeg_quality") or 92), optimize=True)
    return buf.getvalue()


@shared_task(bind=True, queue="thumbnails")
def cloudprinter_render(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    render_job_id = self.request.id or str(uuid.uuid4())
    callback_url = payload["callback_url"]
    callback_token = payload["callback_token"]
    order_id = payload["order_id"]

    try:
        with Workspace():  # ensures tmp cleanup symmetry with other tasks
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for job in payload["jobs"]:
                    jpeg_bytes = _render_one_job(job)
                    basename = job["output_basename"]
                    quantity = int(job.get("quantity") or 1)
                    for copy_idx in range(1, quantity + 1):
                        zf.writestr(f"{basename}_{copy_idx:03d}.jpg", jpeg_bytes)

            zip_bytes = zip_buf.getvalue()
            zip_md5 = hashlib.md5(zip_bytes).hexdigest()
            key = f"cloudprinter-renders/{order_id}/{render_job_id}.zip"
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=zip_bytes,
                ContentType="application/zip",
            )
            zip_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=SIGNED_URL_TTL,
            )

        _post_callback(callback_url, callback_token, {
            "render_job_id": render_job_id,
            "status": "succeeded",
            "zip_url": zip_url,
            "zip_md5": zip_md5,
        })
        return {"status": "succeeded", "render_job_id": render_job_id, "zip_md5": zip_md5}

    except Exception as exc:  # noqa: BLE001
        logger.error("cloudprinter_render failed: %s\n%s", exc, traceback.format_exc())
        _post_callback(callback_url, callback_token, {
            "render_job_id": render_job_id,
            "status": "failed",
            "error": str(exc)[:500],
        })
        return {"status": "failed", "render_job_id": render_job_id, "error": str(exc)[:500]}
