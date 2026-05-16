from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import settings


# Errors that mean "the table or column doesn't exist yet" — we treat these
# as empty results so the dashboard can still render while the schema is
# being rolled out.
_MISSING_SCHEMA_ERRORS = (ProgrammingError, OperationalError)
from app.db.models.job_event import JobEvent
from app.db.models.ops_audit_log import OpsAuditLog
from app.db.models.ops_storage_snapshot import OpsStorageSnapshot
from app.services.health_probes import all_probes
from app.services.job_event_repo import job_event_repo
from app.services.storage_metrics import storage_snapshot
from app.services.system_metrics import system_snapshot, top_processes, celery_workers_live
from app.worker import celery_app

import time as _time

# Queues we always want to surface even when Celery inspect returns nothing
# (e.g. all workers idle). Mirrors the routing keys defined in
# scripts/start-worker-{heavy,light}.sh and the systemd units.
_KNOWN_QUEUES = ("documents", "imposition", "pdf", "default", "thumbnails")

# Tiny in-process cache for the expensive Celery inspect calls so the new
# /v1/ops/live endpoint can be polled every 1-2s without melting the broker.
_INSPECT_TTL_S = 2.0
_inspect_cache: dict[str, tuple[float, dict]] = {}


def _cached_inspect(name: str, fn):
    now = _time.time()
    hit = _inspect_cache.get(name)
    if hit and (now - hit[0]) < _INSPECT_TTL_S:
        return hit[1]
    val = fn() or {}
    _inspect_cache[name] = (now, val)
    return val


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OpsService:
    # ─── basic health ─────────────────────────────────────────────
    def health(self) -> dict:
        return {"status": "ok", "service": "ops"}

    def health_full(self, db: Session) -> dict:
        probes = all_probes(db)
        flat: list[bool] = []
        for k, v in probes.items():
            if k == "binaries":
                for b in v.values():
                    flat.append(bool(b.get("ok")))
            else:
                flat.append(bool(v.get("ok")))
        return {
            "status": "ok" if all(flat) else "degraded",
            "checked_at": _utcnow().isoformat(),
            "probes": probes,
        }

    # ─── system / host metrics ────────────────────────────────────
    def system(self) -> dict:
        return system_snapshot()

    def processes(self, limit: int = 15) -> dict:
        return {"processes": top_processes(limit=limit)}

    # ─── queues ───────────────────────────────────────────────────
    def queues(self) -> dict:
        inspect = celery_app.control.inspect(timeout=1.0)
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}

        queue_names: set[str] = set()
        for bag in (active, reserved):
            for tasks in bag.values():
                for t in tasks or []:
                    rk = (t.get("delivery_info") or {}).get("routing_key")
                    if rk:
                        queue_names.add(rk)
        for tasks in scheduled.values():
            for t in tasks or []:
                rk = (((t.get("request") or {}).get("delivery_info") or {}).get("routing_key"))
                if rk:
                    queue_names.add(rk)

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

    # ─── workers ──────────────────────────────────────────────────
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
                    "prefetch_count": stat.get("prefetch_count"),
                    "total": stat.get("total", {}),
                    "rusage": stat.get("rusage", {}),
                    "broker": stat.get("broker", {}),
                }
            )
        return {"workers": workers}

    # ─── jobs (DB-backed JobEvent stream) ─────────────────────────
    def _serialize_event(self, e: JobEvent) -> dict:
        return {
            "id": str(e.id),
            "job_id": e.job_id,
            "asset_id": e.asset_id,
            "tenant_id": e.tenant_id,
            "app_id": e.app_id,
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

    # The UI status filter speaks the worker-job vocabulary
    # (queued / started / completed / failed / retry), but JobEvent rows
    # use a different vocabulary (running / done / failed). Translate so
    # the dashboard's filter dropdown actually returns rows.
    _STATUS_TO_EVENT = {
        "queued": None,           # job_events never have a "queued" stage
        "started": "running",
        "completed": "done",
        "failed": "failed",
        "retry": None,
    }
    _STATUS_TO_JOB = {
        "queued": "queued",
        "started": "running",
        "completed": "completed",
        "failed": "failed",
        "retry": "queued",
    }

    def _serialize_job_row(self, row: dict) -> dict:
        """Serialize a row from the core `jobs` table into the same shape
        the UI expects from JobEvent rows. Used as a fallback when no
        telemetry events exist yet for a freshly-enqueued job."""
        started = row.get("started_at")
        finished = row.get("finished_at")
        created = row.get("created_at")
        duration_ms = None
        if started and finished:
            duration_ms = max(0, int((finished - started).total_seconds() * 1000))
        return {
            "id": str(row.get("id")),
            "job_id": str(row.get("id")),
            "asset_id": str(row["asset_id"]) if row.get("asset_id") else None,
            "tenant_id": None,
            "app_id": None,
            "task_name": row.get("operation"),
            "queue_name": row.get("queue"),
            "worker_name": None,
            "stage": row.get("operation") or "job",
            "status": row.get("status"),
            "started_at": started.isoformat() if started else (created.isoformat() if created else None),
            "finished_at": finished.isoformat() if finished else None,
            "duration_ms": duration_ms,
            "metadata": row.get("payload") or {},
            "message": (row.get("error") or "")[:500] if row.get("error") else None,
        }

    def jobs(self, db: Session, limit: int = 100, status: str | None = None,
             tenant_id: str | None = None) -> dict:
        # 1. Try job_events first — that's the rich per-stage telemetry.
        try:
            stmt = select(JobEvent).order_by(JobEvent.started_at.desc()).limit(limit)
            if status:
                mapped = self._STATUS_TO_EVENT.get(status, status)
                if mapped is None:
                    # Filter has no event-level equivalent (e.g. "queued"); skip
                    # the events branch entirely and let the jobs-table fallback
                    # handle it below.
                    raise _MISSING_SCHEMA_ERRORS[0]("status not representable in job_events")
                stmt = stmt.where(JobEvent.status == mapped)
            if tenant_id:
                stmt = stmt.where(JobEvent.tenant_id == tenant_id)
            events = list(db.execute(stmt).scalars().all())
            if events:
                return {"jobs": [self._serialize_event(e) for e in events]}
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()

        # 2. Fall back to the core `jobs` table so the dashboard still shows
        #    queued/running/failed/completed jobs even when telemetry is
        #    empty or temporarily unavailable.
        try:
            from sqlalchemy import text
            sql = "select id, asset_id, operation, queue, status, payload, error, created_at, started_at, finished_at from jobs"
            params: dict = {"limit": limit}
            clauses: list[str] = []
            if status:
                clauses.append("status = :status")
                params["status"] = self._STATUS_TO_JOB.get(status, status)
            if clauses:
                sql += " where " + " and ".join(clauses)
            sql += " order by created_at desc limit :limit"
            rows = list(db.execute(text(sql), params).mappings().all())
            return {"jobs": [self._serialize_job_row(dict(r)) for r in rows]}
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"jobs": []}

    def job(self, db: Session, job_id: str) -> dict:
        try:
            events = job_event_repo.list_for_job(db, job_id=job_id)
            return {"job_id": job_id, "events": [self._serialize_event(e) for e in events]}
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"job_id": job_id, "events": []}

    def asset_pipeline(self, db: Session, asset_id: str) -> dict:
        try:
            events = job_event_repo.list_for_asset(db, asset_id=asset_id)
            return {"asset_id": asset_id, "events": [self._serialize_event(e) for e in events]}
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"asset_id": asset_id, "events": []}

    # ─── metrics ─────────────────────────────────────────────────
    def stage_metrics(self, db: Session, hours: int = 24) -> dict:
        try:
            return {"hours": hours, "stages": job_event_repo.stage_metrics(db, hours=hours)}
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"hours": hours, "stages": []}

    def throughput(self, db: Session, hours: int = 24, bucket_minutes: int = 60) -> dict:
        """Jobs-per-bucket over the past N hours, grouped by stage."""
        cutoff = _utcnow() - timedelta(hours=hours)
        try:
            rows = list(
                db.execute(
                    select(JobEvent.stage, JobEvent.started_at, JobEvent.status)
                    .where(JobEvent.started_at >= cutoff)
                ).all()
            )
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"hours": hours, "bucket_minutes": bucket_minutes, "series": []}
        bucket_seconds = max(60, bucket_minutes * 60)
        buckets: dict[int, dict[str, dict[str, int]]] = {}
        for stage, started_at, status in rows:
            ts = int(started_at.timestamp())
            slot = ts - (ts % bucket_seconds)
            buckets.setdefault(slot, {}).setdefault(stage, {"ok": 0, "failed": 0})
            key = "failed" if status == "failed" else "ok"
            buckets[slot][stage][key] += 1
        series = [
            {"timestamp": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(), "stages": stages}
            for ts, stages in sorted(buckets.items())
        ]
        return {"hours": hours, "bucket_minutes": bucket_minutes, "series": series}

    def tenant_usage(self, db: Session, hours: int = 24) -> dict:
        cutoff = _utcnow() - timedelta(hours=hours)
        try:
            rows = list(
                db.execute(
                    select(
                        JobEvent.tenant_id,
                        JobEvent.app_id,
                        func.count().label("events"),
                        func.sum(JobEvent.duration_ms).label("total_ms"),
                    )
                    .where(JobEvent.started_at >= cutoff)
                    .group_by(JobEvent.tenant_id, JobEvent.app_id)
                ).all()
            )
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"hours": hours, "tenants": []}
        out = [
            {
                "tenant_id": r.tenant_id,
                "app_id": r.app_id,
                "events": int(r.events or 0),
                "total_ms": int(r.total_ms or 0),
            }
            for r in rows
        ]
        out.sort(key=lambda x: x["events"], reverse=True)
        return {"hours": hours, "tenants": out}

    # ─── storage ─────────────────────────────────────────────────
    def storage_live(self) -> dict:
        return storage_snapshot()

    def storage_history(self, db: Session, hours: int = 168) -> dict:
        cutoff = _utcnow() - timedelta(hours=hours)
        try:
            rows = list(
                db.execute(
                    select(OpsStorageSnapshot)
                    .where(OpsStorageSnapshot.captured_at >= cutoff)
                    .order_by(OpsStorageSnapshot.captured_at.asc())
                ).scalars().all()
            )
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"hours": hours, "snapshots": []}
        return {
            "hours": hours,
            "snapshots": [
                {
                    "captured_at": r.captured_at.isoformat(),
                    "backend": r.backend,
                    "bucket": r.bucket,
                    "object_count": r.object_count,
                    "total_bytes": r.total_bytes,
                    "breakdown": r.breakdown or {},
                    "duration_ms": r.duration_ms,
                }
                for r in rows
            ],
        }

    # ─── audit log ───────────────────────────────────────────────
    def audit_log(self, db: Session, *, limit: int = 200,
                  action: str | None = None, actor_id: str | None = None,
                  tenant_id: str | None = None) -> dict:
        try:
            stmt = select(OpsAuditLog).order_by(OpsAuditLog.created_at.desc()).limit(limit)
            if action:
                stmt = stmt.where(OpsAuditLog.action == action)
            if actor_id:
                stmt = stmt.where(OpsAuditLog.actor_id == actor_id)
            if tenant_id:
                stmt = stmt.where(OpsAuditLog.tenant_id == tenant_id)
            rows = list(db.execute(stmt).scalars().all())
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"entries": []}
        return {
            "entries": [
                {
                    "id": str(r.id),
                    "actor_id": r.actor_id,
                    "actor_email": r.actor_email,
                    "actor_role": r.actor_role,
                    "action": r.action,
                    "target_type": r.target_type,
                    "target_id": r.target_id,
                    "tenant_id": r.tenant_id,
                    "app_id": r.app_id,
                    "status": r.status,
                    "message": r.message,
                    "request_payload": r.request_payload or {},
                    "response_payload": r.response_payload or {},
                    "created_at": r.created_at.isoformat(),
                }
                for r in rows
            ]
        }

    # ─── config (read-only view of effective settings) ───────────
    def config(self) -> dict:
        # Never expose secret values — only their presence + length.
        def mask(val: str | None) -> dict:
            if not val:
                return {"set": False}
            return {"set": True, "length": len(val)}
        return {
            "app": {
                "name": settings.app_name,
                "env": settings.app_env,
                "debug": settings.app_debug,
            },
            "storage": {
                "mode": settings.storage_mode,
                "supabase_bucket": settings.supabase_storage_bucket,
                "s3_bucket": settings.aws_s3_bucket,
                "s3_region": settings.aws_s3_region,
                "supabase_url_set": bool(settings.supabase_url),
            },
            "binaries": {
                "ghostscript": settings.ghostscript_bin,
                "libreoffice": settings.libreoffice_bin,
                "pdfcpu": settings.pdfcpu_bin,
                "qpdf": settings.qpdf_bin,
            },
            "rendering": {
                "thumbnail_dpi": settings.thumbnail_dpi,
                "preview_dpi": settings.preview_dpi,
                "max_upload_mb": settings.max_upload_mb,
            },
            "secrets_status": {
                "supabase_service_role_key": mask(settings.supabase_service_role_key),
                "aws_access_key_id": mask(settings.aws_access_key_id),
                "aws_secret_access_key": mask(settings.aws_secret_access_key),
            },
            "celery": {
                "broker_url_set": bool(settings.celery_broker_url),
                "result_backend_set": bool(settings.celery_result_backend),
            },
        }


ops_service = OpsService()
