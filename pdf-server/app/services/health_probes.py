"""Health probes for every external dependency the document engine relies on.

Each probe returns a dict { ok, latency_ms, detail } so the Overview page can
show a uniform traffic-light grid. All probes are best-effort and should never
raise — failures are reported via ok=False + detail.
"""
from __future__ import annotations

import shutil
import socket
import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.worker import celery_app


def _timed(fn) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        detail = fn()
        return {
            "ok": True,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "detail": detail,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "detail": f"{exc.__class__.__name__}: {exc}",
        }


def probe_postgres(db: Session) -> dict[str, Any]:
    return _timed(lambda: db.execute(text("SELECT 1")).scalar())


def probe_redis() -> dict[str, Any]:
    def _check():
        try:
            import redis  # type: ignore
        except ImportError:
            return "redis client not installed"
        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=2.0, socket_timeout=2.0)
        return client.ping()
    return _timed(_check)


def probe_celery() -> dict[str, Any]:
    """Pings every worker. Returns the response map."""
    def _check():
        broker = getattr(celery_app.conf, "broker_url", "") or ""
        broker_host = broker.split("@")[-1].split("/")[0] if broker else "unknown"
        replies = celery_app.control.ping(timeout=5.0) or []
        if not replies:
            raise RuntimeError(f"no workers replied to ping (broker={broker_host})")
        return {"workers": len(replies), "broker": broker_host, "names": [list(r.keys())[0] for r in replies if r]}
    return _timed(_check)


def probe_s3() -> dict[str, Any]:
    """Verify we can reach the configured S3 bucket. No-op if not in s3 mode."""
    def _check():
        if settings.storage_mode != "s3":
            return f"storage_mode={settings.storage_mode} (s3 not active)"
        try:
            import boto3  # type: ignore
        except ImportError:
            raise RuntimeError("boto3 not installed")
        s3 = boto3.client(
            "s3",
            region_name=settings.aws_s3_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        s3.head_bucket(Bucket=settings.aws_s3_bucket)
        return {"bucket": settings.aws_s3_bucket, "region": settings.aws_s3_region}
    return _timed(_check)


def probe_supabase() -> dict[str, Any]:
    def _check():
        if not settings.supabase_url:
            return "supabase not configured"
        # DNS-only check — we don't want to leak service-role calls here.
        host = settings.supabase_url.replace("https://", "").replace("http://", "").split("/")[0]
        socket.gethostbyname(host)
        return {"host": host}
    return _timed(_check)


def probe_binary(path_or_name: str) -> dict[str, Any]:
    def _check():
        resolved = shutil.which(path_or_name) or path_or_name
        if not shutil.which(path_or_name):
            raise FileNotFoundError(f"{path_or_name!r} not on PATH")
        return {"path": resolved}
    return _timed(_check)


def all_probes(db: Session) -> dict[str, Any]:
    return {
        "postgres": probe_postgres(db),
        "redis": probe_redis(),
        "celery": probe_celery(),
        "s3": probe_s3(),
        "supabase": probe_supabase(),
        "binaries": {
            "ghostscript": probe_binary(settings.ghostscript_bin),
            "libreoffice": probe_binary(settings.libreoffice_bin),
            "pdfcpu": probe_binary(settings.pdfcpu_bin),
            "qpdf": probe_binary(settings.qpdf_bin),
        },
    }
