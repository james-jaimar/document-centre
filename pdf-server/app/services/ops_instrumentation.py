from __future__ import annotations

import os
from contextlib import contextmanager
from sqlalchemy.orm import Session

from app.services.job_event_repo import job_event_repo


def _worker_name(task) -> str | None:
    try:
        return task.request.hostname
    except Exception:
        return os.getenv("HOSTNAME")


def _queue_name(task) -> str | None:
    try:
        info = getattr(task.request, "delivery_info", None) or {}
        return info.get("routing_key") or info.get("exchange")
    except Exception:
        return None


@contextmanager
def stage_timer(
    db: Session,
    *,
    task,
    job_id: str,
    asset_id: str | None,
    stage: str,
    metadata: dict | None = None,
    message: str | None = None,
):
    evt = job_event_repo.start(
        db,
        job_id=job_id,
        asset_id=asset_id,
        task_name=getattr(task, "name", None),
        queue_name=_queue_name(task),
        worker_name=_worker_name(task),
        stage=stage,
        metadata=metadata,
        message=message,
    )
    try:
        yield evt
    except Exception as exc:
        job_event_repo.fail(db, evt.id, metadata={"error_type": exc.__class__.__name__}, message=str(exc))
        raise
    else:
        job_event_repo.finish(db, evt.id)
