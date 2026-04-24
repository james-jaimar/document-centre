"""S3 / object-storage rollups for the Storage admin page."""
from __future__ import annotations

import shutil
import time
from typing import Any

from app.core.config import settings


def _disk_usage() -> dict[str, int]:
    """Best-effort disk usage for the local storage path (or root)."""
    path = getattr(settings, "local_storage_path", None) or "/"
    try:
        usage = shutil.disk_usage(path)
        return {"total": usage.total, "used": usage.used, "free": usage.free}
    except Exception:
        return {"total": 0, "used": 0, "free": 0}


def storage_live() -> dict[str, Any]:
    """Lightweight live snapshot used by ops dashboard + scheduled task.

    Returns a flat shape:
      {
        "backend": "s3"|"local"|...,
        "bucket": "...",
        "s3":   {"object_count": int, "bytes": int} | None,
        "disk": {"total": int, "used": int, "free": int},
      }
    """
    disk = _disk_usage()
    out: dict[str, Any] = {
        "backend": settings.storage_mode,
        "bucket": settings.aws_s3_bucket if settings.storage_mode == "s3" else "(local)",
        "disk": disk,
        "s3": None,
    }

    if settings.storage_mode != "s3":
        return out

    try:
        import boto3  # type: ignore
    except ImportError:
        return out

    try:
        s3 = boto3.client(
            "s3",
            region_name=settings.aws_s3_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        paginator = s3.get_paginator("list_objects_v2")
        count = 0
        total = 0
        for page in paginator.paginate(Bucket=settings.aws_s3_bucket):
            for obj in page.get("Contents", []) or []:
                count += 1
                total += int(obj.get("Size") or 0)
        out["s3"] = {"object_count": count, "bytes": total}
    except Exception as exc:  # noqa: BLE001
        out["s3"] = {"object_count": 0, "bytes": 0, "error": str(exc)}

    return out


def storage_snapshot() -> dict[str, Any]:
    """Walk the configured S3 bucket once and return total object count + bytes,
    grouped by top-level prefix. Cheap for ≤100k objects, expensive after that —
    cached via the hourly beat task `snapshot_storage_usage`."""
    started = time.perf_counter()

    if settings.storage_mode != "s3":
        return {
            "backend": settings.storage_mode,
            "bucket": "(local)" if settings.storage_mode == "local" else settings.supabase_storage_bucket,
            "available": False,
            "reason": f"snapshot only implemented for s3 (current: {settings.storage_mode})",
        }

    try:
        import boto3  # type: ignore
    except ImportError:
        return {"available": False, "reason": "boto3 not installed"}

    s3 = boto3.client(
        "s3",
        region_name=settings.aws_s3_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )

    paginator = s3.get_paginator("list_objects_v2")
    breakdown: dict[str, dict[str, int]] = {}
    total_count = 0
    total_bytes = 0

    for page in paginator.paginate(Bucket=settings.aws_s3_bucket):
        for obj in page.get("Contents", []) or []:
            size = int(obj.get("Size") or 0)
            key = obj["Key"]
            top = key.split("/", 1)[0] if "/" in key else "(root)"
            slot = breakdown.setdefault(top, {"count": 0, "bytes": 0})
            slot["count"] += 1
            slot["bytes"] += size
            total_count += 1
            total_bytes += size

    return {
        "backend": "s3",
        "bucket": settings.aws_s3_bucket,
        "available": True,
        "object_count": total_count,
        "total_bytes": total_bytes,
        "breakdown": breakdown,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    }
