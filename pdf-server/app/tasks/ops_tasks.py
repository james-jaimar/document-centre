"""Periodic ops maintenance tasks.

Scheduled via Celery Beat. Includes:
  • hourly storage snapshot (writes a row to ops_storage_snapshots)
  • daily tmp/cache cleanup
"""
from __future__ import annotations

import logging
import os
import shutil
import tempfile
import time
from datetime import datetime, timezone

from celery import shared_task

from app.db.session import SessionLocal
from app.db.models.ops_storage_snapshot import OpsStorageSnapshot
from app.services.storage_metrics import storage_live

log = logging.getLogger(__name__)


@shared_task(name="ops.snapshot_storage")
def snapshot_storage() -> dict:
    """Capture an S3 + local-disk usage snapshot row."""
    live = storage_live()
    db = SessionLocal()
    try:
        snap = OpsStorageSnapshot(
            captured_at=datetime.now(timezone.utc),
            s3_object_count=live.get("s3", {}).get("object_count"),
            s3_bytes=live.get("s3", {}).get("bytes"),
            disk_used_bytes=live.get("disk", {}).get("used"),
            disk_free_bytes=live.get("disk", {}).get("free"),
            payload=live,
        )
        db.add(snap)
        db.commit()
        return {"ok": True, "captured_at": snap.captured_at.isoformat()}
    finally:
        db.close()


@shared_task(name="ops.cleanup_tmp")
def cleanup_tmp(max_age_hours: int = 24) -> dict:
    """Remove files in the system tmp dir older than max_age_hours."""
    cutoff = time.time() - (max_age_hours * 3600)
    root = tempfile.gettempdir()
    removed = 0
    bytes_freed = 0
    errors = 0
    for entry in os.scandir(root):
        try:
            st = entry.stat(follow_symlinks=False)
            if st.st_mtime > cutoff:
                continue
            if entry.is_file(follow_symlinks=False) or entry.is_symlink():
                bytes_freed += st.st_size
                os.unlink(entry.path)
                removed += 1
            elif entry.is_dir(follow_symlinks=False):
                shutil.rmtree(entry.path, ignore_errors=True)
                removed += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("cleanup_tmp: failed on %s: %s", entry.path, exc)
            errors += 1
    return {"removed": removed, "bytes_freed": bytes_freed, "errors": errors}
