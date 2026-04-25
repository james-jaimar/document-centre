from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models.job_event import JobEvent

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Errors that mean "telemetry is unavailable right now" — usually because the
# job_events table or one of its columns hasn't been migrated yet, or the DB
# connection is in a bad state. We MUST swallow these in the worker path so
# they never abort the actual PDF processing job.
_DEGRADED_DB_ERRORS = (ProgrammingError, OperationalError)


def _safe_rollback(db: Session) -> None:
    try:
        db.rollback()
    except Exception:
        pass


class JobEventRepo:
    """Best-effort job event recorder.

    Telemetry must never break the customer pipeline. Every write is wrapped
    so that if `job_events` is missing, has the wrong shape, or the DB is
    momentarily unavailable, we log a warning and return None instead of
    propagating the exception into the Celery task.
    """

    def start(
        self,
        db: Session,
        *,
        job_id: str,
        asset_id: str | None,
        task_name: str | None,
        queue_name: str | None,
        worker_name: str | None,
        stage: str,
        tenant_id: str | None = None,
        app_id: str | None = None,
        metadata: dict | None = None,
        message: str | None = None,
    ) -> JobEvent | None:
        evt = JobEvent(
            job_id=job_id,
            asset_id=asset_id,
            tenant_id=tenant_id,
            app_id=app_id,
            task_name=task_name,
            queue_name=queue_name,
            worker_name=worker_name,
            stage=stage,
            status="running",
            started_at=_utcnow(),
            metadata_json=metadata or {},
            message=message,
        )
        try:
            db.add(evt)
            db.commit()
            db.refresh(evt)
            return evt
        except _DEGRADED_DB_ERRORS as exc:
            _safe_rollback(db)
            logger.warning("job_events.start skipped (telemetry unavailable): %s", exc.__class__.__name__)
            return None
        except SQLAlchemyError as exc:
            _safe_rollback(db)
            logger.warning("job_events.start failed: %s", exc)
            return None

    def finish(
        self,
        db: Session,
        event_id,
        *,
        metadata: dict | None = None,
        message: str | None = None,
        status: str = "done",
    ) -> JobEvent | None:
        if event_id is None:
            return None
        try:
            evt = db.get(JobEvent, event_id)
            if not evt:
                return None
            finished_at = _utcnow()
            evt.finished_at = finished_at
            evt.duration_ms = max(0, int((finished_at - evt.started_at).total_seconds() * 1000))
            evt.status = status
            if metadata:
                evt.metadata_json = {**(evt.metadata_json or {}), **metadata}
            if message:
                evt.message = message
            db.add(evt)
            db.commit()
            db.refresh(evt)
            return evt
        except _DEGRADED_DB_ERRORS as exc:
            _safe_rollback(db)
            logger.warning("job_events.finish skipped (telemetry unavailable): %s", exc.__class__.__name__)
            return None
        except SQLAlchemyError as exc:
            _safe_rollback(db)
            logger.warning("job_events.finish failed: %s", exc)
            return None

    def fail(self, db: Session, event_id, *, metadata: dict | None = None, message: str | None = None) -> JobEvent | None:
        return self.finish(db, event_id, metadata=metadata, message=message, status="failed")

    def list_recent(self, db: Session, limit: int = 100) -> list[JobEvent]:
        try:
            return list(
                db.execute(select(JobEvent).order_by(JobEvent.started_at.desc()).limit(limit)).scalars().all()
            )
        except _DEGRADED_DB_ERRORS:
            _safe_rollback(db)
            return []

    def list_for_job(self, db: Session, job_id: str) -> list[JobEvent]:
        try:
            return list(
                db.execute(select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.started_at.asc())).scalars().all()
            )
        except _DEGRADED_DB_ERRORS:
            _safe_rollback(db)
            return []

    def list_for_asset(self, db: Session, asset_id: str) -> list[JobEvent]:
        try:
            return list(
                db.execute(select(JobEvent).where(JobEvent.asset_id == asset_id).order_by(JobEvent.started_at.asc())).scalars().all()
            )
        except _DEGRADED_DB_ERRORS:
            _safe_rollback(db)
            return []

    def stage_metrics(self, db: Session, hours: int = 24) -> list[dict]:
        cutoff = _utcnow() - timedelta(hours=hours)
        try:
            events = list(
                db.execute(
                    select(JobEvent)
                    .where(JobEvent.started_at >= cutoff)
                    .where(JobEvent.duration_ms.is_not(None))
                    .order_by(JobEvent.started_at.desc())
                ).scalars().all()
            )
        except _DEGRADED_DB_ERRORS:
            _safe_rollback(db)
            return []
        by_stage: dict[str, list[int]] = {}
        for evt in events:
            by_stage.setdefault(evt.stage, []).append(int(evt.duration_ms or 0))
        output = []
        for stage, values in by_stage.items():
            values.sort()
            p95_index = min(len(values) - 1, max(0, int(len(values) * 0.95) - 1))
            output.append(
                {
                    "stage": stage,
                    "count": len(values),
                    "avg_ms": int(sum(values) / len(values)),
                    "max_ms": max(values),
                    "p95_ms": values[p95_index],
                }
            )
        output.sort(key=lambda x: x["avg_ms"], reverse=True)
        return output


job_event_repo = JobEventRepo()
