"""HTTP endpoints that execute Celery-style tasks for Cloud Tasks push.

Cloud Tasks signs each request with an OIDC token issued for a dedicated
service account. We verify the token against the audience (this service's
own URL) before dispatching to the registered task callable.

Mounted only when ROLE in {worker-heavy-http, worker-light-http,
worker-emails-http}; the production API service does not expose these
endpoints.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.tasks.registry import resolve

log = logging.getLogger("tasks_routes")

tasks_router = APIRouter(prefix="/internal/tasks", tags=["internal"])

# Audience the OIDC token must match. Set this to the worker's own Cloud Run
# URL via the WORKER_SELF_URL env var (the deploy step writes this after the
# service exists). If unset, OIDC verification is skipped (local dev only).
_EXPECTED_AUDIENCE = os.getenv("WORKER_SELF_URL")


def _verify_oidc(request: Request) -> None:
    """Verify the Cloud Tasks-issued OIDC bearer token.

    Skipped when WORKER_SELF_URL is unset (local dev). In production the
    deploy script wires WORKER_SELF_URL to the Cloud Run service URL.
    """
    if not _EXPECTED_AUDIENCE:
        log.warning("WORKER_SELF_URL unset — skipping OIDC verification (DEV ONLY)")
        return

    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth.split(" ", 1)[1].strip()

    # Lazy import — google-auth is only present in Cloud Run images.
    from google.auth.transport import requests as g_requests  # type: ignore
    from google.oauth2 import id_token  # type: ignore

    try:
        claims = id_token.verify_oauth2_token(
            token, g_requests.Request(), audience=_EXPECTED_AUDIENCE
        )
    except Exception as e:  # noqa: BLE001
        log.warning("OIDC verification failed: %s", e)
        raise HTTPException(status_code=401, detail="invalid oidc token") from e

    issuer = claims.get("iss", "")
    if "accounts.google.com" not in issuer:
        raise HTTPException(status_code=401, detail=f"unexpected issuer: {issuer}")


@tasks_router.post("/{task_name}")
async def run_task(task_name: str, request: Request) -> dict[str, Any]:
    _verify_oidc(request)

    try:
        payload = await request.json()
    except Exception:
        payload = {}
    args = list(payload.get("args") or [])
    kwargs = dict(payload.get("kwargs") or {})

    try:
        fn = resolve(task_name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    log.info("running task=%s args=%s kwargs=%s", task_name, args, list(kwargs.keys()))
    # Celery tasks are callable as plain functions via .run / .__call__.
    # We support both Celery tasks and bare callables.
    runner = getattr(fn, "run", fn)
    try:
        result = runner(*args, **kwargs)
    except Exception as e:  # noqa: BLE001
        log.exception("task %s failed", task_name)
        # Returning 500 tells Cloud Tasks to retry per the queue's retry config.
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e

    return {"ok": True, "task": task_name, "result_type": type(result).__name__}
