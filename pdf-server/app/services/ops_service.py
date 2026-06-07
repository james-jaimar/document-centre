from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
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
    def _broker_depths(self, queue_names: list[str]) -> dict[str, int]:
        """Read pending depth straight from the Redis broker via LLEN.

        Celery enqueues each task as a JSON message on a Redis list named
        after the routing key. `inspect()` only sees what's *checked out*
        by a worker (active/reserved), so for true "waiting in the queue"
        depth we have to talk to the broker directly.
        """
        depths: dict[str, int] = {q: 0 for q in queue_names}
        try:
            with celery_app.connection_for_read() as conn:
                client = conn.default_channel.client  # redis.Redis instance
                for q in queue_names:
                    try:
                        depths[q] = int(client.llen(q))
                    except Exception:
                        depths[q] = 0
        except Exception:
            pass
        return depths

    def queues(self) -> dict:
        inspect = celery_app.control.inspect(timeout=1.0)
        active = _cached_inspect("active", inspect.active)
        reserved = _cached_inspect("reserved", inspect.reserved)
        scheduled = _cached_inspect("scheduled", inspect.scheduled)

        queue_names: set[str] = set(_KNOWN_QUEUES)
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

        depths = self._broker_depths(sorted(queue_names))
        gcp_stats = self._cloud_tasks_queue_stats()

        rows = []
        for q in sorted(queue_names):
            cloud = gcp_stats.get(q, {})
            rows.append(
                {
                    "name": q,
                    "depth": cloud.get("tasks_count", depths.get(q, 0)),
                    "active": sum(
                        1 for tasks in active.values() for t in (tasks or [])
                        if ((t.get("delivery_info") or {}).get("routing_key") == q)
                    ) or cloud.get("concurrent_dispatches_count", 0),
                    "reserved": sum(
                        1 for tasks in reserved.values() for t in (tasks or [])
                        if ((t.get("delivery_info") or {}).get("routing_key") == q)
                    ),
                    "scheduled": sum(
                        1 for tasks in scheduled.values() for t in (tasks or [])
                        if (((t.get("request") or {}).get("delivery_info") or {}).get("routing_key") == q)
                    ),
                    "cloud_tasks": cloud or None,
                }
            )
        total_depth = sum(int(r.get("depth") or 0) for r in rows)
        return {"queues": rows, "total_depth": total_depth, "backend": os.getenv("QUEUE_BACKEND", "celery")}

    def _cloud_tasks_queue_stats(self) -> dict[str, dict]:
        """Direct Cloud Tasks queue stats, when running in GCP mode.

        This gives the ops dashboard GCP-native depth/dispatch data instead
        of relying on Celery inspect, which is empty in Cloud Tasks mode.
        """
        if os.getenv("QUEUE_BACKEND", "celery").lower() != "cloud_tasks":
            return {}
        try:
            from google.cloud import tasks_v2  # type: ignore
            from google.protobuf import field_mask_pb2  # type: ignore
            from app.core.queue import QUEUE_TO_CLOUD_TASKS_QUEUE

            project = os.environ["GCP_PROJECT_ID"]
            region = os.getenv("GCP_TASKS_REGION") or os.environ["GCP_REGION"]
            client = tasks_v2.CloudTasksClient()
            read_mask = field_mask_pb2.FieldMask(paths=["stats"])
            out: dict[str, dict] = {}
            for logical, queue_id in QUEUE_TO_CLOUD_TASKS_QUEUE.items():
                name = client.queue_path(project, region, queue_id)
                q = client.get_queue(request={"name": name, "read_mask": read_mask})
                stats = q.stats
                oldest = getattr(stats, "oldest_estimated_arrival_time", None)
                oldest_iso = None
                if oldest:
                    try:
                        oldest_iso = oldest.ToDatetime(tzinfo=timezone.utc).isoformat()
                    except Exception:
                        oldest_iso = str(oldest)
                out[logical] = {
                    "queue_id": queue_id,
                    "tasks_count": int(getattr(stats, "tasks_count", 0) or 0),
                    "concurrent_dispatches_count": int(getattr(stats, "concurrent_dispatches_count", 0) or 0),
                    "executed_last_minute_count": int(getattr(stats, "executed_last_minute_count", 0) or 0),
                    "oldest_estimated_arrival_time": oldest_iso,
                }
            return out
        except Exception as exc:  # noqa: BLE001
            return {q: {"error": str(exc)} for q in _KNOWN_QUEUES}

    # ─── workers ──────────────────────────────────────────────────
    def workers(self) -> dict:
        inspect = celery_app.control.inspect(timeout=1.0)
        stats = _cached_inspect("stats", inspect.stats)
        active = _cached_inspect("active", inspect.active)
        registered = _cached_inspect("registered", inspect.registered)

        # Build live host-process map keyed by short worker name (e.g. "heavy").
        live_by_name: dict[str, dict] = {}
        for w in celery_workers_live():
            live_by_name[w["name"]] = w

        workers = []
        for name, stat in stats.items():
            pool = stat.get("pool") or {}
            short = name.split("@", 1)[0]
            live = live_by_name.get(short, {})
            workers.append(
                {
                    "name": name,
                    "short_name": short,
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
                    # Live per-process — the "task manager" view.
                    "live_cpu_percent": live.get("cpu_percent"),
                    "live_rss_bytes": live.get("rss_bytes"),
                    "live_children": live.get("children", []),
                }
            )

        # Also include any workers psutil saw on this host but Celery inspect
        # missed (e.g. broker connectivity hiccup) so we never lie about
        # "no workers running".
        seen = {w["short_name"] for w in workers}
        for short, live in live_by_name.items():
            if short in seen:
                continue
            workers.append(
                {
                    "name": f"{short}@unknown",
                    "short_name": short,
                    "status": "host-only",
                    "active_tasks": None,
                    "pool": {"processes": None, "max_concurrency": live.get("child_count")},
                    "registered_tasks_count": None,
                    "prefetch_count": None,
                    "total": {},
                    "rusage": {},
                    "broker": {},
                    "live_cpu_percent": live.get("cpu_percent"),
                    "live_rss_bytes": live.get("rss_bytes"),
                    "live_children": live.get("children", []),
                }
            )
        return {"workers": workers}

    # ─── compact live snapshot (for 1-2s polling) ─────────────────
    def live(self) -> dict:
        """One cheap call: host CPU/mem, queue depth total, per-worker live
        stats and active task counts. Designed for the Ops Overview tile
        refresh — uses the cached inspect + cached CPU sample so it can be
        polled at 1Hz without overloading the broker."""
        snap = system_snapshot()
        depths = self._broker_depths(list(_KNOWN_QUEUES))
        total_depth = sum(depths.values())

        inspect = celery_app.control.inspect(timeout=1.0)
        active = _cached_inspect("active", inspect.active)

        workers_live = celery_workers_live()
        # Attach active-task counts where the short name matches.
        active_by_short: dict[str, int] = {}
        for name, tasks in active.items():
            short = name.split("@", 1)[0]
            active_by_short[short] = active_by_short.get(short, 0) + len(tasks or [])

        workers_out = []
        for w in workers_live:
            workers_out.append(
                {
                    "name": w["name"],
                    "pid": w["pid"],
                    "cpu_percent": w["cpu_percent"],
                    "rss_bytes": w["rss_bytes"],
                    "child_count": w["child_count"],
                    "active_tasks": active_by_short.get(w["name"], 0),
                    "children": w["children"],
                }
            )

        return {
            "captured_at": snap.get("captured_at"),
            "cpu": snap.get("cpu", {}),
            "memory": snap.get("memory", {}),
            "queue_depth_total": total_depth,
            "queue_depths": depths,
            "workers": workers_out,
        }

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
        def _iso(v):
            return v.isoformat() if hasattr(v, "isoformat") else v

        try:
            events = job_event_repo.list_for_asset(db, asset_id=asset_id)
            asset = db.execute(text("""
                select id, original_filename, media_type, source_storage_path,
                       normalized_storage_path, status, page_count, width_pt,
                       height_pt, thumbnail_storage_path, preview_storage_path,
                       metadata, created_at, updated_at
                  from assets
                 where id = :asset_id
            """), {"asset_id": asset_id}).mappings().first()
            jobs = db.execute(text("""
                select id, operation, queue, status, retries, celery_task_id,
                       payload, result, error, created_at, started_at,
                       finished_at, updated_at
                  from jobs
                 where asset_id = :asset_id
                 order by created_at asc
            """), {"asset_id": asset_id}).mappings().all()
            derived = db.execute(text("""
                select kind, page, storage_path, media_type, width, height,
                       created_at
                  from derived_files
                 where asset_id = :asset_id
                 order by page asc nulls last, kind asc, created_at desc
            """), {"asset_id": asset_id}).mappings().all()

            cache = {"checked": False, "hit": False}
            if asset and asset.get("normalized_storage_path"):
                try:
                    from app.services.files import cache_get
                    cached_path = cache_get(asset["normalized_storage_path"])
                    cache = {"checked": True, "hit": cached_path is not None}
                    if cached_path is not None:
                        st = cached_path.stat()
                        cache.update({"bytes": st.st_size, "mtime": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()})
                except Exception as exc:  # noqa: BLE001
                    cache = {"checked": True, "hit": False, "error": str(exc)}

            return {
                "asset_id": asset_id,
                "asset": {k: _iso(v) for k, v in dict(asset).items()} if asset else None,
                "jobs": [{k: _iso(v) for k, v in dict(r).items()} for r in jobs],
                "derived_files": [{k: _iso(v) for k, v in dict(r).items()} for r in derived],
                "events": [self._serialize_event(e) for e in events],
                "counts": {
                    "jobs": len(jobs),
                    "derived_files": len(derived),
                    "preview_pages": len({r["page"] for r in derived if r.get("kind") == "preview_page" and r.get("page") is not None}),
                    "thumbnail_pages": len({r["page"] for r in derived if r.get("kind") == "thumbnail_page" and r.get("page") is not None}),
                },
                "cache": cache,
            }
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"asset_id": asset_id, "asset": None, "jobs": [], "derived_files": [], "events": []}

    def cloud_run_logs(self, *, search: str, minutes: int = 60, limit: int = 100) -> dict:
        """Read recent Cloud Run logs directly from GCP Cloud Logging.

        Uses the Cloud Run service account's Application Default Credentials;
        requires `roles/logging.viewer` (or equivalent) on the GCP project.
        """
        if not search:
            return {"entries": [], "error": "search required"}
        project = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project:
            return {"entries": [], "error": "GCP_PROJECT_ID/GOOGLE_CLOUD_PROJECT is not set"}

        start = datetime.now(timezone.utc) - timedelta(minutes=max(1, minutes))
        safe_search = search.replace('"', '\\"')
        log_filter = (
            'resource.type="cloud_run_revision" '
            f'timestamp >= "{start.isoformat()}" '
            f'("{safe_search}")'
        )
        try:
            import google.auth  # type: ignore
            from google.auth.transport.requests import AuthorizedSession  # type: ignore

            creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            session = AuthorizedSession(creds)
            resp = session.post(
                "https://logging.googleapis.com/v2/entries:list",
                json={
                    "resourceNames": [f"projects/{project}"],
                    "filter": log_filter,
                    "orderBy": "timestamp desc",
                    "pageSize": max(1, min(limit, 500)),
                },
                timeout=10,
            )
            resp.raise_for_status()
            raw = resp.json().get("entries", [])
            entries = []
            for e in raw:
                payload = e.get("textPayload") or e.get("jsonPayload") or e.get("protoPayload") or {}
                entries.append({
                    "timestamp": e.get("timestamp"),
                    "severity": e.get("severity"),
                    "service": ((e.get("resource") or {}).get("labels") or {}).get("service_name"),
                    "revision": ((e.get("resource") or {}).get("labels") or {}).get("revision_name"),
                    "payload": payload,
                })
            return {"project": project, "filter": log_filter, "entries": entries}
        except Exception as exc:  # noqa: BLE001
            return {"project": project, "filter": log_filter, "entries": [], "error": f"{type(exc).__name__}: {exc}"}

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


    # ─── GCP-native live snapshot ────────────────────────────────
    def _gcp_project(self) -> str | None:
        return os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")

    def _cloud_run_services(self) -> list[str]:
        raw = (getattr(settings, "ops_cloud_run_services", "") or "").strip()
        if not raw:
            return []
        return [s.strip() for s in raw.split(",") if s.strip()]

    def _monitoring_session(self):
        """Return a google-auth AuthorizedSession or None if ADC unavailable."""
        try:
            import google.auth  # type: ignore
            from google.auth.transport.requests import AuthorizedSession  # type: ignore
            creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            return AuthorizedSession(creds)
        except Exception:
            return None

    def _monitoring_series(self, session, project: str, *, metric_type: str,
                           service_filter: str | None, aligner: str,
                           reducer: str | None, minutes: int = 5,
                           group_by: list[str] | None = None) -> list[dict]:
        """Call Cloud Monitoring projects.timeSeries.list and return raw points."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=max(1, minutes))
        filter_parts = [f'metric.type = "{metric_type}"']
        if service_filter:
            filter_parts.append(service_filter)
        params = {
            "filter": " AND ".join(filter_parts),
            "interval.startTime": start.isoformat().replace("+00:00", "Z"),
            "interval.endTime": end.isoformat().replace("+00:00", "Z"),
            "aggregation.alignmentPeriod": "60s",
            "aggregation.perSeriesAligner": aligner,
        }
        if reducer:
            params["aggregation.crossSeriesReducer"] = reducer
            for gb in group_by or []:
                params.setdefault("aggregation.groupByFields", []).append(gb)
        try:
            resp = session.get(
                f"https://monitoring.googleapis.com/v3/projects/{project}/timeSeries",
                params=params,
                timeout=8,
            )
            resp.raise_for_status()
            return resp.json().get("timeSeries", []) or []
        except Exception:
            return []

    @staticmethod
    def _latest_point_value(series_list: list[dict]) -> float | None:
        for s in series_list:
            pts = s.get("points") or []
            if not pts:
                continue
            v = pts[0].get("value") or {}
            for k in ("doubleValue", "int64Value"):
                if k in v:
                    try:
                        return float(v[k])
                    except Exception:
                        pass
            dist = v.get("distributionValue") or {}
            mean = dist.get("mean")
            if mean is not None:
                try:
                    return float(mean)
                except Exception:
                    pass
        return None

    @staticmethod
    def _distribution_p95(series_list: list[dict]) -> float | None:
        # Cloud Monitoring returns a histogram. Approximate p95 from
        # bucketCounts + bucketOptions. Falls back to mean if shape unknown.
        for s in series_list:
            pts = s.get("points") or []
            if not pts:
                continue
            dist = (pts[0].get("value") or {}).get("distributionValue") or {}
            counts = dist.get("bucketCounts") or []
            opts = dist.get("bucketOptions") or {}
            total = sum(int(c) for c in counts)
            if not total:
                continue
            target = total * 0.95
            running = 0
            # Build bucket upper bounds.
            bounds: list[float] = []
            if "explicitBuckets" in opts:
                bounds = list(opts["explicitBuckets"].get("bounds") or [])
            elif "exponentialBuckets" in opts:
                eb = opts["exponentialBuckets"]
                scale = float(eb.get("scale", 1.0))
                gf = float(eb.get("growthFactor", 2.0))
                n = int(eb.get("numFiniteBuckets", len(counts) - 1))
                bounds = [scale * (gf ** i) for i in range(n + 1)]
            elif "linearBuckets" in opts:
                lb = opts["linearBuckets"]
                offset = float(lb.get("offset", 0.0))
                width = float(lb.get("width", 1.0))
                n = int(lb.get("numFiniteBuckets", len(counts) - 1))
                bounds = [offset + width * i for i in range(n + 1)]
            if not bounds:
                mean = dist.get("mean")
                return float(mean) if mean is not None else None
            for i, c in enumerate(counts):
                running += int(c)
                if running >= target:
                    if i < len(bounds):
                        return float(bounds[i])
                    return float(bounds[-1])
            return float(bounds[-1])
        return None

    def _service_filter(self, services: list[str]) -> str:
        if not services:
            return ""
        quoted = " OR ".join(f'"{s}"' for s in services)
        return f'resource.labels.service_name = one_of({quoted})'

    def _gcp_cloud_run(self, session, project: str, services: list[str]) -> dict:
        if not session or not services:
            return {"services": [], "totals": {}, "error": "session_unavailable" if not session else "no_services"}

        per_service: dict[str, dict] = {s: {"service": s} for s in services}

        def _annotate(metric_type: str, key: str, aligner: str, reducer: str = "REDUCE_MEAN", *, p95: bool = False):
            for svc in services:
                series = self._monitoring_series(
                    session, project,
                    metric_type=metric_type,
                    service_filter=f'resource.labels.service_name = "{svc}"',
                    aligner=aligner,
                    reducer=reducer,
                    minutes=5,
                    group_by=["resource.labels.service_name"],
                )
                if not series:
                    per_service[svc][key] = None
                    continue
                per_service[svc][key] = self._distribution_p95(series) if p95 else self._latest_point_value(series)

        # CPU and memory utilization (0..1, fraction)
        _annotate("run.googleapis.com/container/cpu/utilizations", "cpu_utilization", "ALIGN_MEAN")
        _annotate("run.googleapis.com/container/memory/utilizations", "memory_utilization", "ALIGN_MEAN")
        # Instance count (separate by state via group_by — we just take total mean for now)
        _annotate("run.googleapis.com/container/instance_count", "instance_count", "ALIGN_MEAN", "REDUCE_SUM")
        # Request count over last 1m and request latency p95
        _annotate("run.googleapis.com/request_count", "request_count_1m", "ALIGN_DELTA", "REDUCE_SUM")
        _annotate("run.googleapis.com/request_latencies", "request_latency_p95_ms", "ALIGN_DELTA", "REDUCE_MEAN", p95=True)
        _annotate("run.googleapis.com/container/startup_latencies", "startup_latency_ms", "ALIGN_MEAN", "REDUCE_MEAN")

        services_out = list(per_service.values())
        totals = {
            "instance_count": sum((s.get("instance_count") or 0) for s in services_out),
            "request_count_1m": sum((s.get("request_count_1m") or 0) for s in services_out),
        }
        return {"services": services_out, "totals": totals, "region": os.getenv("GCP_REGION")}

    def _gcp_cloud_tasks_snapshot(self) -> dict:
        stats = self._cloud_tasks_queue_stats()
        queues = []
        total_pending = 0
        total_in_flight = 0
        for logical, info in stats.items():
            if "error" in info:
                queues.append({"id": logical, "error": info["error"]})
                continue
            tc = int(info.get("tasks_count") or 0)
            cd = int(info.get("concurrent_dispatches_count") or 0)
            total_pending += tc
            total_in_flight += cd
            queues.append({
                "id": info.get("queue_id") or logical,
                "logical": logical,
                "tasks_count": tc,
                "concurrent_dispatches": cd,
                "executed_last_minute": int(info.get("executed_last_minute_count") or 0),
                "oldest_eta": info.get("oldest_estimated_arrival_time"),
            })
        return {
            "queues": queues,
            "total_pending": total_pending,
            "total_in_flight": total_in_flight,
            "backend": os.getenv("QUEUE_BACKEND", "celery"),
        }

    def _recent_jobs_summary(self, db: Session, minutes: int = 5) -> dict:
        cutoff = _utcnow() - timedelta(minutes=minutes)
        try:
            rows = list(db.execute(
                select(JobEvent.status, func.count())
                .where(JobEvent.started_at >= cutoff)
                .group_by(JobEvent.status)
            ).all())
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"minutes": minutes, "ok": 0, "failed": 0, "running": 0}
        out = {"minutes": minutes, "ok": 0, "failed": 0, "running": 0}
        for status, count in rows:
            if status == "failed":
                out["failed"] += int(count)
            elif status == "running":
                out["running"] += int(count)
            else:
                out["ok"] += int(count)
        return out

    def gcp_live(self, db: Session) -> dict:
        project = self._gcp_project()
        services = self._cloud_run_services()
        if not project:
            return {
                "captured_at": int(_time.time()),
                "error": "GCP_PROJECT_ID not set",
                "cloud_run": {"services": []},
                "cloud_tasks": self._gcp_cloud_tasks_snapshot(),
                "recent_jobs": self._recent_jobs_summary(db),
            }
        session = self._monitoring_session()
        return {
            "captured_at": int(_time.time()),
            "project": project,
            "region": os.getenv("GCP_REGION"),
            "tasks_region": os.getenv("GCP_TASKS_REGION") or os.getenv("GCP_REGION"),
            "cloud_run": self._gcp_cloud_run(session, project, services),
            "cloud_tasks": self._gcp_cloud_tasks_snapshot(),
            "recent_jobs": self._recent_jobs_summary(db),
        }

    def gcp_logs(self, *, service: str | None = None, severity: str | None = None,
                 minutes: int = 30, limit: int = 100, search: str | None = None) -> dict:
        project = self._gcp_project()
        if not project:
            return {"entries": [], "error": "GCP_PROJECT_ID not set"}
        start = datetime.now(timezone.utc) - timedelta(minutes=max(1, minutes))
        parts = ['resource.type="cloud_run_revision"',
                 f'timestamp >= "{start.isoformat()}"']
        if service:
            parts.append(f'resource.labels.service_name = "{service}"')
        if severity:
            parts.append(f'severity >= {severity.upper()}')
        if search:
            safe = search.replace('"', '\\"')
            parts.append(f'("{safe}")')
        log_filter = " ".join(parts)
        try:
            session = self._monitoring_session()
            if session is None:
                return {"entries": [], "filter": log_filter, "error": "ADC unavailable"}
            resp = session.post(
                "https://logging.googleapis.com/v2/entries:list",
                json={
                    "resourceNames": [f"projects/{project}"],
                    "filter": log_filter,
                    "orderBy": "timestamp desc",
                    "pageSize": max(1, min(limit, 500)),
                },
                timeout=10,
            )
            resp.raise_for_status()
            raw = resp.json().get("entries", [])
            entries = []
            for e in raw:
                payload = e.get("textPayload") or e.get("jsonPayload") or e.get("protoPayload") or {}
                entries.append({
                    "timestamp": e.get("timestamp"),
                    "severity": e.get("severity"),
                    "service": ((e.get("resource") or {}).get("labels") or {}).get("service_name"),
                    "revision": ((e.get("resource") or {}).get("labels") or {}).get("revision_name"),
                    "payload": payload,
                })
            return {"project": project, "filter": log_filter, "entries": entries}
        except Exception as exc:  # noqa: BLE001
            return {"project": project, "filter": log_filter, "entries": [], "error": f"{type(exc).__name__}: {exc}"}

    # ─── stuck-job reconciler ─────────────────────────────────────
    def reconcile_running_jobs(self, db: Session, *, grace_seconds: int | None = None,
                               actor: dict | None = None) -> dict:
        """Mark `running` job_events that have exceeded their grace as failed.

        Per-stage grace:
        - generate_previews: settings.ops_reconcile_previews_grace_seconds
        - everything else:   settings.ops_reconcile_grace_seconds
        Rows older than settings.ops_reconcile_ceiling_seconds are always failed.
        """
        now = _utcnow()
        default_grace = grace_seconds if grace_seconds and grace_seconds > 0 else settings.ops_reconcile_grace_seconds
        previews_grace = settings.ops_reconcile_previews_grace_seconds
        ceiling = settings.ops_reconcile_ceiling_seconds

        scanned = 0
        reconciled: list[dict] = []
        still_running: list[dict] = []
        try:
            rows = list(db.execute(
                select(JobEvent)
                .where(JobEvent.status == "running")
                .order_by(JobEvent.started_at.asc())
                .limit(500)
            ).scalars().all())
        except _MISSING_SCHEMA_ERRORS:
            db.rollback()
            return {"scanned": 0, "reconciled": 0, "still_running": 0, "sample": [], "error": "schema missing"}

        scanned = len(rows)
        for ev in rows:
            started = ev.started_at
            if started is None:
                continue
            age = (now - started).total_seconds()
            stage = (ev.stage or "").lower()
            grace = previews_grace if "preview" in stage else default_grace
            force = age >= ceiling
            if not force and age < grace:
                still_running.append({"id": str(ev.id), "stage": stage, "age_seconds": int(age)})
                continue
            duration_ms = max(0, int(age * 1000))
            reason = (
                "reconciled: hard ceiling exceeded — no terminal event"
                if force
                else f"reconciled: exceeded {int(grace)}s grace for stage={stage or '?'} — no terminal event"
            )
            ev.status = "failed"
            ev.finished_at = now
            ev.duration_ms = duration_ms
            existing = ev.message or ""
            ev.message = (existing + ("\n" if existing else "") + reason)[:2000]
            reconciled.append({
                "id": str(ev.id),
                "job_id": ev.job_id,
                "task_name": ev.task_name,
                "stage": stage,
                "age_seconds": int(age),
                "reason": "ceiling" if force else "grace",
            })
            try:
                db.add(OpsAuditLog(
                    actor_id=(actor or {}).get("user_id"),
                    actor_email=(actor or {}).get("email"),
                    actor_role=(actor or {}).get("role"),
                    action="job_event.reconcile",
                    target_type="job_event",
                    target_id=str(ev.id),
                    tenant_id=ev.tenant_id,
                    app_id=ev.app_id,
                    status="ok",
                    message=reason,
                    request_payload={"grace_seconds": int(grace), "age_seconds": int(age)},
                    response_payload={"new_status": "failed", "duration_ms": duration_ms},
                ))
            except Exception:
                # Audit failure must not block reconcile.
                pass
        try:
            db.commit()
        except Exception:
            db.rollback()
            return {"scanned": scanned, "reconciled": 0, "still_running": len(still_running),
                    "sample": reconciled[:25], "error": "commit failed"}

        return {
            "scanned": scanned,
            "reconciled": len(reconciled),
            "still_running": len(still_running),
            "sample": reconciled[:25],
            "still_running_sample": still_running[:25],
        }


ops_service = OpsService()

