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

from app.core.config import settings
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


def _cloud_tasks_headers(request: Request) -> dict[str, str]:
    """Extract Cloud Tasks diagnostic headers — present only on push tasks."""
    keys = (
        "x-cloudtasks-queuename",
        "x-cloudtasks-taskname",
        "x-cloudtasks-taskretrycount",
        "x-cloudtasks-taskexecutioncount",
        "x-cloudtasks-tasketa",
    )
    out: dict[str, str] = {}
    for k in keys:
        v = request.headers.get(k)
        if v is not None:
            out[k] = v
    return out


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

    ct_headers = _cloud_tasks_headers(request)
    retry_count = ct_headers.get("x-cloudtasks-taskretrycount", "0")
    exec_count = ct_headers.get("x-cloudtasks-taskexecutioncount", "0")

    log.info(
        "running task=%s retry=%s exec=%s args=%s kwargs=%s",
        task_name, retry_count, exec_count, args, list(kwargs.keys()),
    )

    # Idempotency guard for retried tasks: if Cloud Tasks fires a second
    # attempt while the first is still running (or already finished), skip
    # the duplicate work. The first positional arg pattern is (asset_id,
    # job_id, ...) for every task in this codebase; the optional job_id
    # kwarg covers the chained variants.
    try:
        retry_num = int(retry_count)
    except ValueError:
        retry_num = 0

    if retry_num > 0:
        job_id = kwargs.get("job_id")
        if job_id is None and len(args) >= 2:
            job_id = args[1]
        if isinstance(job_id, str) and len(job_id) >= 8:
            try:
                from app.db.session import SessionLocal
                from sqlalchemy import text as _text
                _db = SessionLocal()
                try:
                    row = _db.execute(
                        _text("select status, started_at from jobs where id = :id"),
                        {"id": job_id},
                    ).first()
                finally:
                    _db.close()
                if row is not None:
                    status, started_at = row[0], row[1]
                    if status in ("completed", "cancelled"):
                        log.warning(
                            "task %s skipped — job %s already %s (retry=%s)",
                            task_name, job_id, status, retry_count,
                        )
                        return {"ok": True, "task": task_name, "skipped": status}
                    if status == "running" and started_at is not None:
                        from datetime import datetime, timezone, timedelta
                        # If the previous attempt started recently AND we're
                        # seeing a retry, the original may still be in flight.
                        # Do NOT return 200 here: acknowledging a retry deletes
                        # the Cloud Task, and if the original worker was killed
                        # after marking the job running, the job stays stuck
                        # forever with partial derived_files. Return a retryable
                        # 503 until the original finishes or the running marker
                        # becomes stale enough to re-execute safely.
                        try:
                            if started_at.tzinfo is None:
                                started_at = started_at.replace(tzinfo=timezone.utc)
                            age = datetime.now(timezone.utc) - started_at
                        except Exception:
                            age = timedelta(seconds=0)
                        preview_task = task_name in {"generate_previews", "render_specific_pages", "render_one_page"}
                        grace_seconds = (
                            settings.cloud_tasks_preview_running_grace_seconds
                            if preview_task
                            else settings.cloud_tasks_running_grace_seconds
                        )
                        if age < timedelta(seconds=max(30, grace_seconds)):
                            log.warning(
                                "task %s retry deferred — job %s already running %ds "
                                "(retry=%s grace=%ss)",
                                task_name, job_id, int(age.total_seconds()), retry_count, grace_seconds,
                            )
                            raise HTTPException(
                                status_code=503,
                                detail=f"job {job_id} already running; retry later",
                            )
            except Exception as guard_exc:  # noqa: BLE001
                log.warning("idempotency guard check failed: %s", guard_exc)

    # Celery tasks are callable as plain functions via .run / .__call__.
    # We support both Celery tasks and bare callables.
    runner = getattr(fn, "run", fn)
    try:
        result = runner(*args, **kwargs)
    except Exception as e:  # noqa: BLE001
        log.exception("task %s failed (retry=%s)", task_name, retry_count)
        # Returning 500 tells Cloud Tasks to retry per the queue's retry config.
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e

    return {"ok": True, "task": task_name, "result_type": type(result).__name__}
