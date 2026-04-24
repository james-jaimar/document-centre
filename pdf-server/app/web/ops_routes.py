"""Document Centre Ops & Control API.

All endpoints are under /v1/ops. The edge function `pdf-api` proxies them
after gating on the platform_admin role; this server intentionally does
NOT verify auth — it trusts only the proxy. The `X-Ops-Actor-*` headers
forwarded by the proxy carry user_id / email / role / tenant_id / app_id
for the audit log.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.ops_control import ops_control
from app.services.ops_service import ops_service
from app.services.sse_stream import event_stream

ops_router = APIRouter(prefix="/ops", tags=["ops"])


# ─── actor extraction (from edge proxy headers) ──────────────────
def actor_from_headers(
    x_ops_actor_id: str | None = Header(default=None),
    x_ops_actor_email: str | None = Header(default=None),
    x_ops_actor_role: str | None = Header(default=None),
    x_ops_tenant_id: str | None = Header(default=None),
    x_ops_app_id: str | None = Header(default=None),
) -> dict[str, Any]:
    return {
        "user_id": x_ops_actor_id,
        "email": x_ops_actor_email,
        "role": x_ops_actor_role,
        "tenant_id": x_ops_tenant_id,
        "app_id": x_ops_app_id,
    }


# ─── basic health ─────────────────────────────────────────────────
@ops_router.get("/health")
def ops_health():
    return ops_service.health()


@ops_router.get("/health/full")
def ops_health_full(db: Session = Depends(get_db)):
    return ops_service.health_full(db)


# ─── system / host metrics ────────────────────────────────────────
@ops_router.get("/system")
def ops_system():
    return ops_service.system()


@ops_router.get("/system/processes")
def ops_processes(limit: int = Query(default=15, ge=1, le=100)):
    return ops_service.processes(limit=limit)


# ─── queues ───────────────────────────────────────────────────────
@ops_router.get("/queues")
def ops_queues():
    return ops_service.queues()


@ops_router.get("/queues/{queue_name}/peek")
def ops_queue_peek(queue_name: str, limit: int = Query(default=25, ge=1, le=200)):
    return ops_control.peek_queue(get_db().__next__(), queue_name, limit=limit)  # noqa: B021


@ops_router.post("/queues/{queue_name}/purge")
def ops_queue_purge(queue_name: str, db: Session = Depends(get_db),
                    actor: dict = Depends(actor_from_headers)):
    return ops_control.purge_queue(db, queue_name, actor=actor)


# ─── workers ──────────────────────────────────────────────────────
@ops_router.get("/workers")
def ops_workers():
    return ops_service.workers()


@ops_router.post("/workers/ping")
def ops_workers_ping(db: Session = Depends(get_db),
                     actor: dict = Depends(actor_from_headers)):
    return ops_control.ping_workers(db, actor=actor)


@ops_router.post("/workers/{worker_name}/shutdown")
def ops_worker_shutdown(worker_name: str, db: Session = Depends(get_db),
                        actor: dict = Depends(actor_from_headers)):
    return ops_control.shutdown_worker(db, worker_name, actor=actor)


@ops_router.post("/workers/{worker_name}/pool/grow")
def ops_worker_pool_grow(worker_name: str, n: int = Query(default=1, ge=1, le=32),
                         db: Session = Depends(get_db),
                         actor: dict = Depends(actor_from_headers)):
    return ops_control.pool_grow(db, worker_name, n=n, actor=actor)


@ops_router.post("/workers/{worker_name}/pool/shrink")
def ops_worker_pool_shrink(worker_name: str, n: int = Query(default=1, ge=1, le=32),
                           db: Session = Depends(get_db),
                           actor: dict = Depends(actor_from_headers)):
    return ops_control.pool_shrink(db, worker_name, n=n, actor=actor)


@ops_router.post("/workers/{worker_name}/consumers/cancel")
def ops_worker_cancel_consumer(worker_name: str, queue: str = Query(...),
                               db: Session = Depends(get_db),
                               actor: dict = Depends(actor_from_headers)):
    return ops_control.cancel_consumer(db, worker_name, queue, actor=actor)


@ops_router.post("/workers/{worker_name}/consumers/add")
def ops_worker_add_consumer(worker_name: str, queue: str = Query(...),
                            db: Session = Depends(get_db),
                            actor: dict = Depends(actor_from_headers)):
    return ops_control.add_consumer(db, worker_name, queue, actor=actor)


# ─── jobs / tasks ─────────────────────────────────────────────────
@ops_router.get("/jobs")
def ops_jobs(limit: int = Query(default=100, ge=1, le=1000),
             status: str | None = None,
             tenant_id: str | None = None,
             db: Session = Depends(get_db)):
    return ops_service.jobs(db, limit=limit, status=status, tenant_id=tenant_id)


@ops_router.get("/jobs/{job_id}")
def ops_job(job_id: str, db: Session = Depends(get_db)):
    return ops_service.job(db, job_id=job_id)


@ops_router.post("/tasks/{task_id}/revoke")
def ops_task_revoke(task_id: str, terminate: bool = False,
                    db: Session = Depends(get_db),
                    actor: dict = Depends(actor_from_headers)):
    return ops_control.revoke_task(db, task_id, terminate=terminate, actor=actor)


# ─── assets ───────────────────────────────────────────────────────
@ops_router.get("/assets/{asset_id}/pipeline")
def ops_asset_pipeline(asset_id: str, db: Session = Depends(get_db)):
    return ops_service.asset_pipeline(db, asset_id=asset_id)


# ─── metrics ──────────────────────────────────────────────────────
@ops_router.get("/metrics/stages")
def ops_metrics_stages(hours: int = Query(default=24, ge=1, le=720),
                       db: Session = Depends(get_db)):
    return ops_service.stage_metrics(db, hours=hours)


@ops_router.get("/metrics/throughput")
def ops_metrics_throughput(hours: int = Query(default=24, ge=1, le=720),
                           bucket_minutes: int = Query(default=60, ge=5, le=1440),
                           db: Session = Depends(get_db)):
    return ops_service.throughput(db, hours=hours, bucket_minutes=bucket_minutes)


@ops_router.get("/metrics/tenants")
def ops_metrics_tenants(hours: int = Query(default=24, ge=1, le=720),
                        db: Session = Depends(get_db)):
    return ops_service.tenant_usage(db, hours=hours)


# ─── storage ──────────────────────────────────────────────────────
@ops_router.get("/storage/live")
def ops_storage_live():
    return ops_service.storage_live()


@ops_router.get("/storage/history")
def ops_storage_history(hours: int = Query(default=168, ge=1, le=2160),
                        db: Session = Depends(get_db)):
    return ops_service.storage_history(db, hours=hours)


# ─── audit log ────────────────────────────────────────────────────
@ops_router.get("/audit")
def ops_audit(
    limit: int = Query(default=200, ge=1, le=1000),
    action: str | None = None,
    actor_id: str | None = None,
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
):
    return ops_service.audit_log(db, limit=limit, action=action,
                                 actor_id=actor_id, tenant_id=tenant_id)


# ─── config ───────────────────────────────────────────────────────
@ops_router.get("/config")
def ops_config():
    return ops_service.config()


# ─── SSE stream of live JobEvents ─────────────────────────────────
@ops_router.get("/events/stream")
async def ops_events_stream(request: Request):
    async def _gen():
        async for chunk in event_stream():
            if await request.is_disconnected():
                break
            event = chunk.get("event", "message")
            data = chunk.get("data", "{}")
            yield f"event: {event}\ndata: {data}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
