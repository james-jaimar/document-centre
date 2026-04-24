from __future__ import annotations

from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.job_event import JobEvent


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobEventRepo:
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
    ) -> JobEvent:
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
        db.add(evt)
        db.commit()
        db.refresh(evt)
        return evt

    def finish(
        self,
        db: Session,
        event_id,
        *,
        metadata: dict | None = None,
        message: str | None = None,
        status: str = "done",
    ) -> JobEvent | None:
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

    def fail(self, db: Session, event_id, *, metadata: dict | None = None, message: str | None = None) -> JobEvent | None:
        return self.finish(db, event_id, metadata=metadata, message=message, status="failed")

    def list_recent(self, db: Session, limit: int = 100) -> list[JobEvent]:
        return list(
            db.execute(select(JobEvent).order_by(JobEvent.started_at.desc()).limit(limit)).scalars().all()
        )

    def list_for_job(self, db: Session, job_id: str) -> list[JobEvent]:
        return list(
            db.execute(select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.started_at.asc())).scalars().all()
        )

    def list_for_asset(self, db: Session, asset_id: str) -> list[JobEvent]:
        return list(
            db.execute(select(JobEvent).where(JobEvent.asset_id == asset_id).order_by(JobEvent.started_at.asc())).scalars().all()
        )

    def stage_metrics(self, db: Session, hours: int = 24) -> list[dict]:
        cutoff = _utcnow() - timedelta(hours=hours)
        events = list(
            db.execute(
                select(JobEvent)
                .where(JobEvent.started_at >= cutoff)
                .where(JobEvent.duration_ms.is_not(None))
                .order_by(JobEvent.started_at.desc())
            ).scalars().all()
        )
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
