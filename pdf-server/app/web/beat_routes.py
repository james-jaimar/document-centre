"""HTTP endpoints invoked by Cloud Scheduler (replaces Celery beat).

Each beat job maps to a single POST handler here. Cloud Scheduler signs the
request with an OIDC token (audience = this service's URL).

Mounted on the pdf-api service only.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.core.queue import enqueue
from app.tasks.registry import resolve

log = logging.getLogger("beat_routes")

beat_router = APIRouter(prefix="/internal/beat", tags=["internal"])

_EXPECTED_AUDIENCE = os.getenv("BEAT_SELF_URL")


def _verify_oidc(request: Request) -> None:
    if not _EXPECTED_AUDIENCE:
        log.warning("BEAT_SELF_URL unset — skipping OIDC verification (DEV ONLY)")
        return
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    from google.auth.transport import requests as g_requests  # type: ignore
    from google.oauth2 import id_token  # type: ignore
    try:
        id_token.verify_oauth2_token(token, g_requests.Request(), audience=_EXPECTED_AUDIENCE)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="invalid oidc token") from e


@beat_router.post("/snapshot-storage")
async def beat_snapshot_storage(request: Request) -> dict[str, Any]:
    """Runs hourly. Was Celery: ops-snapshot-storage-hourly."""
    _verify_oidc(request)
    fn = resolve("ops.snapshot_storage")
    runner = getattr(fn, "run", fn)
    runner()
    return {"ok": True}


@beat_router.post("/cleanup-tmp")
async def beat_cleanup_tmp(request: Request) -> dict[str, Any]:
    """Runs daily. Was Celery: ops-cleanup-tmp-daily."""
    _verify_oidc(request)
    fn = resolve("ops.cleanup_tmp")
    runner = getattr(fn, "run", fn)
    runner(max_age_hours=24)
    return {"ok": True}


@beat_router.post("/email-scan-outbox")
async def beat_email_scan_outbox(request: Request) -> dict[str, Any]:
    """Runs every 30s. Pushes a single scan_outbox task to the emails-control queue."""
    _verify_oidc(request)
    task_id = enqueue("scan_outbox", queue="emails-control")
    return {"ok": True, "enqueued": task_id}


@beat_router.post("/email-release-stuck")
async def beat_email_release_stuck(request: Request) -> dict[str, Any]:
    """Runs every 5 min."""
    _verify_oidc(request)
    task_id = enqueue("release_stuck", queue="emails-control")
    return {"ok": True, "enqueued": task_id}
