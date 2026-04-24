from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.job_event import JobEvent
from app.services.job_event_repo import job_event_repo
from app.worker import celery_app


class OpsService:
    def health(self) -> dict:
        return {"status": "ok", "service": "ops"}

    def queues(self) -> dict:
        inspect = celery_app.control.inspect(timeout=1.0)
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}

        queue_names = set()
        for worker, tasks in active.items():
            for t in tasks or []:
                q = (t.get("delivery_info") or {}).get("routing_key")
                if q:
                    queue_names.add(q)
        for worker, tasks in reserved.items():
            for t in tasks or []:
                q = (t.get("delivery_info") or {}).get("routing_key")
                if q:
                    queue_names.add(q)
        for worker, tasks in scheduled.items():
            for t in tasks or []:
                req = t.get("request") or {}
                q = (req.get("delivery_info") or {}).get("routing_key")
                if q:
                    queue_names.add(q)

        rows = []
        for q in sorted(queue_names):
            rows.append(
                {
                    "name": q,
                    "active": sum(
                        1 for tasks in active.values() for t in (tasks or [])
                        if ((t.get("delivery_info") or {}).get("routing_key") == q)
                    ),
                    "reserved": sum(
                        1 for tasks in reserved.values() for t in (tasks or [])
                        if ((t.get("delivery_info") or {}).get("routing_key") == q)
                    ),
                    "scheduled": sum(
                        1 for tasks in scheduled.values() for t in (tasks or [])
                        if (((t.get("request") or {}).get("delivery_info") or {}).get("routing_key") == q)
                    ),
                }
            )
        return {"queues": rows}

    def workers(self) -> dict:
        inspect = celery_app.control.inspect(timeout=1.0)
        stats = inspect.stats() or {}
        active = inspect.active() or {}
        registered = inspect.registered() or {}

        workers = []
        for name, stat in stats.items():
            pool = stat.get("pool") or {}
            workers.append(
                {
                    "name": name,
                    "status": "busy" if len(active.get(name, []) or []) else "idle",
                    "active_tasks": len(active.get(name, []) or []),
                    "pool": {
                        "max_concurrency": pool.get("max-concurrency"),
                        "processes": pool.get("processes"),
                    },
                    "registered_tasks_count": len(registered.get(name, []) or []),
                    "prefetch_count": (stat.get("prefetch_count")),
                    "total": stat.get("total", {}),
                }
            )
        return {"workers": workers}

    def jobs(self, db: Session, limit: int = 100) -> dict:
        events = job_event_repo.list_recent(db, limit=limit)
        return {
            "jobs": [
                {
                    "job_id": e.job_id,
                    "asset_id": e.asset_id,
                    "task_name": e.task_name,
                    "queue_name": e.queue_name,
                    "worker_name": e.worker_name,
                    "stage": e.stage,
                    "status": e.status,
                    "started_at": e.started_at.isoformat() if e.started_at else None,
                    "finished_at": e.finished_at.isoformat() if e.finished_at else None,
                    "duration_ms": e.duration_ms,
                    "metadata": e.metadata_json or {},
                    "message": e.message,
                }
                for e in events
            ]
        }

    def job(self, db: Session, job_id: str) -> dict:
        events = job_event_repo.list_for_job(db, job_id=job_id)
        return {
            "job_id": job_id,
            "events": [
                {
                    "stage": e.stage,
                    "status": e.status,
                    "task_name": e.task_name,
                    "queue_name": e.queue_name,
                    "worker_name": e.worker_name,
                    "started_at": e.started_at.isoformat() if e.started_at else None,
                    "finished_at": e.finished_at.isoformat() if e.finished_at else None,
                    "duration_ms": e.duration_ms,
                    "metadata": e.metadata_json or {},
                    "message": e.message,
                }
                for e in events
            ]
        }

    def asset_pipeline(self, db: Session, asset_id: str) -> dict:
        events = job_event_repo.list_for_asset(db, asset_id=asset_id)
        return {
            "asset_id": asset_id,
            "events": [
                {
                    "job_id": e.job_id,
                    "stage": e.stage,
                    "status": e.status,
                    "task_name": e.task_name,
                    "queue_name": e.queue_name,
                    "worker_name": e.worker_name,
                    "started_at": e.started_at.isoformat() if e.started_at else None,
                    "finished_at": e.finished_at.isoformat() if e.finished_at else None,
                    "duration_ms": e.duration_ms,
                    "metadata": e.metadata_json or {},
                    "message": e.message,
                }
                for e in events
            ]
        }

    def stage_metrics(self, db: Session, hours: int = 24) -> dict:
        return {"hours": hours, "stages": job_event_repo.stage_metrics(db, hours=hours)}


ops_service = OpsService()
