"""Server-Sent Events stream for live JobEvents.

Emits one event per JobEvent row as it appears in the database, plus
periodic heartbeat events so proxies don't kill idle connections. The
client (`useOpsStream`) polls the DB at 2s intervals via this endpoint and
the FE consumes it as a stream — no broker subscription required, which
keeps the implementation portable across Redis/RabbitMQ.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.job_event import JobEvent
from app.db.session import SessionLocal


def _serialize(evt: JobEvent) -> dict:
    return {
        "id": str(evt.id),
        "job_id": evt.job_id,
        "asset_id": evt.asset_id,
        "tenant_id": evt.tenant_id,
        "app_id": evt.app_id,
        "task_name": evt.task_name,
        "queue_name": evt.queue_name,
        "worker_name": evt.worker_name,
        "stage": evt.stage,
        "status": evt.status,
        "started_at": evt.started_at.isoformat() if evt.started_at else None,
        "finished_at": evt.finished_at.isoformat() if evt.finished_at else None,
        "duration_ms": evt.duration_ms,
        "message": evt.message,
        "metadata": evt.metadata_json or {},
    }


async def event_stream(
    *,
    poll_interval: float = 2.0,
    heartbeat_interval: float = 15.0,
) -> AsyncGenerator[dict, None]:
    """Yield SSE-shaped dicts. Designed to be wrapped by sse_starlette."""
    last_seen: datetime = datetime.now(timezone.utc)
    last_heartbeat = asyncio.get_event_loop().time()

    while True:
        db: Session = SessionLocal()
        try:
            rows = list(
                db.execute(
                    select(JobEvent)
                    .where(JobEvent.started_at > last_seen)
                    .order_by(JobEvent.started_at.asc())
                    .limit(100)
                ).scalars().all()
            )
            for evt in rows:
                last_seen = evt.started_at
                yield {"event": "job_event", "data": json.dumps(_serialize(evt))}
        finally:
            db.close()

        now = asyncio.get_event_loop().time()
        if now - last_heartbeat >= heartbeat_interval:
            last_heartbeat = now
            yield {"event": "heartbeat", "data": json.dumps({"ts": datetime.now(timezone.utc).isoformat()})}

        await asyncio.sleep(poll_interval)
