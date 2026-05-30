from __future__ import annotations
import hashlib
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import settings

log = logging.getLogger(__name__)


class Workspace:
    def __init__(self):
        self.tmp = TemporaryDirectory(prefix='printforge-')
        self.root = Path(self.tmp.name)

    def path(self, name: str) -> Path:
        return self.root / name

    def cleanup(self):
        self.tmp.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.cleanup()


def unique_name(prefix: str, suffix: str) -> str:
    return f'{prefix}/{uuid.uuid4()}{suffix}'


# ---------------------------------------------------------------------------
# Shared on-disk PDF cache
#
# The heavy worker (prepare_for_product) and the light worker
# (generate_previews) both run on the same host. Once prepare_for_product
# has written the prepared PDF to S3 + Postgres, it copies the same file
# into this cache. The next task (generate_previews against the freshly
# promoted normalized_storage_path) reads the cache instead of pulling
# the file back down from S3.
#
# S3 remains the source of truth. The cache is best-effort: any failure
# (disk full, permissions, race with cleanup) falls back to storage.download
# transparently. Entries are pruned by ops.cleanup_tmp once they age out.
# ---------------------------------------------------------------------------
def _cache_path(storage_path: str) -> Path:
    """Map an S3 storage path → deterministic local cache file."""
    digest = hashlib.sha1(storage_path.encode('utf-8')).hexdigest()
    return Path(settings.pdf_cache_dir) / digest[:2] / f'{digest}.pdf'


def cache_get(storage_path: str) -> Path | None:
    """Return a cached copy of ``storage_path`` if present and fresh.

    Returns ``None`` on any miss (disabled, missing, stale, error).
    Touches mtime on hit so frequently-used files don't get pruned.
    """
    if not settings.pdf_cache_enabled or not storage_path:
        return None
    try:
        path = _cache_path(storage_path)
        if not path.exists():
            return None
        st = path.stat()
        age = time.time() - st.st_mtime
        if age > settings.pdf_cache_max_age_seconds:
            return None
        # Touch so re-reads keep it warm during a session.
        try:
            os.utime(path, None)
        except OSError:
            pass
        return path
    except Exception as exc:  # noqa: BLE001
        log.warning('pdf_cache: get(%s) failed: %s', storage_path, exc)
        return None


def cache_put(storage_path: str, local_path: Path) -> bool:
    """Copy ``local_path`` into the shared cache, keyed by ``storage_path``.

    Atomic: writes to a sibling ``.tmp.<pid>`` file then ``os.replace``.
    Best-effort: returns False (and logs) on any failure so callers can
    keep going — S3 remains authoritative.
    """
    if not settings.pdf_cache_enabled or not storage_path:
        return False
    try:
        dest = _cache_path(storage_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(f'.tmp.{os.getpid()}.{uuid.uuid4().hex[:8]}')
        shutil.copyfile(local_path, tmp)
        os.replace(tmp, dest)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning('pdf_cache: put(%s) failed: %s', storage_path, exc)
        return False


def cache_prune(max_age_seconds: int | None = None) -> dict:
    """Remove cache entries older than ``max_age_seconds`` (default TTL).

    Returns a summary dict suitable for the ops.cleanup_tmp beat job.
    """
    if not settings.pdf_cache_enabled:
        return {'removed': 0, 'bytes_freed': 0, 'errors': 0, 'skipped': True}
    root = Path(settings.pdf_cache_dir)
    if not root.exists():
        return {'removed': 0, 'bytes_freed': 0, 'errors': 0}
    cutoff = time.time() - (max_age_seconds or settings.pdf_cache_max_age_seconds)
    removed = 0
    bytes_freed = 0
    errors = 0
    for sub in root.iterdir():
        if not sub.is_dir():
            continue
        for entry in sub.iterdir():
            try:
                st = entry.stat()
                if st.st_mtime >= cutoff:
                    continue
                bytes_freed += st.st_size
                entry.unlink()
                removed += 1
            except Exception as exc:  # noqa: BLE001
                log.warning('pdf_cache: prune %s failed: %s', entry, exc)
                errors += 1
    return {'removed': removed, 'bytes_freed': bytes_freed, 'errors': errors}
