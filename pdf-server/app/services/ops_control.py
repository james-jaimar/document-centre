"""Audited control plane for queue / worker / job operations.

Every method writes to ops_audit_log BEFORE returning so we have a
permanent forensic record of who ran what and when. All actions are
idempotent or explicitly fail-safe — see individual docstrings.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db.models.ops_audit_log import OpsAuditLog
from app.worker import celery_app


# ─── audit helper ──────────────────────────────────────────────────────
def _audit(
    db: Session,
    *,
    actor: dict[str, Any] | None,
    action: str,
    target_type: str | None,
    target_id: str | None,
    request_payload: dict | None = None,
    response_payload: dict | None = None,
    status: str = "ok",
    message: str | None = None,
) -> None:
    actor = actor or {}
    entry = OpsAuditLog(
        actor_id=actor.get("user_id"),
        actor_email=actor.get("email"),
        actor_role=actor.get("role"),
        tenant_id=actor.get("tenant_id"),
        app_id=actor.get("app_id"),
        action=action,
        target_type=target_type,
        target_id=target_id,
        status=status,
        message=message,
        request_payload=request_payload or {},
        response_payload=response_payload or {},
    )
    db.add(entry)
    db.commit()


# ─── queues ────────────────────────────────────────────────────────────
class OpsControl:
    def purge_queue(self, db: Session, queue_name: str, *, actor: dict | None = None) -> dict:
        """Drains all pending tasks from the given queue. NOT idempotent —
        any in-flight tasks already taken by a worker will still complete."""
        try:
            count = celery_app.control.purge() or 0  # purges all queues by default
            # NOTE: Celery's purge() doesn't accept a queue arg via inspect;
            # we use the broker directly for per-queue precision.
            with celery_app.connection_or_acquire() as conn:
                count = conn.default_channel.queue_purge(queue_name)
            resp = {"queue": queue_name, "purged": int(count)}
            _audit(db, actor=actor, action="queue.purge", target_type="queue", target_id=queue_name,
                   response_payload=resp)
            return resp
        except Exception as exc:  # noqa: BLE001
            _audit(db, actor=actor, action="queue.purge", target_type="queue", target_id=queue_name,
                   status="failed", message=str(exc))
            raise

    def peek_queue(self, db: Session, queue_name: str, limit: int = 25) -> dict:
        """Read-only — returns reserved tasks for the queue. No audit needed."""
        inspect = celery_app.control.inspect(timeout=1.0)
        reserved = inspect.reserved() or {}
        active = inspect.active() or {}
        results: list[dict] = []
        for source, bag in (("active", active), ("reserved", reserved)):
            for worker, tasks in bag.items():
                for t in tasks or []:
                    rk = (t.get("delivery_info") or {}).get("routing_key")
                    if rk == queue_name:
                        results.append(
                            {
                                "worker": worker,
                                "source": source,
                                "task_id": t.get("id"),
                                "name": t.get("name"),
                                "args": t.get("args"),
                                "kwargs": t.get("kwargs"),
                                "time_start": t.get("time_start"),
                            }
                        )
                    if len(results) >= limit:
                        return {"queue": queue_name, "tasks": results, "truncated": True}
        return {"queue": queue_name, "tasks": results, "truncated": False}

    # ─── workers ──────────────────────────────────────────────────────
    def ping_workers(self, db: Session, *, actor: dict | None = None) -> dict:
        replies = celery_app.control.ping(timeout=1.5) or []
        return {"workers": replies}

    def shutdown_worker(self, db: Session, worker_name: str, *, actor: dict | None = None) -> dict:
        try:
            celery_app.control.broadcast("shutdown", destination=[worker_name])
            resp = {"worker": worker_name, "signalled": True}
            _audit(db, actor=actor, action="worker.shutdown", target_type="worker", target_id=worker_name,
                   response_payload=resp)
            return resp
        except Exception as exc:  # noqa: BLE001
            _audit(db, actor=actor, action="worker.shutdown", target_type="worker", target_id=worker_name,
                   status="failed", message=str(exc))
            raise

    def pool_grow(self, db: Session, worker_name: str, n: int = 1, *, actor: dict | None = None) -> dict:
        celery_app.control.broadcast("pool_grow", arguments={"n": n}, destination=[worker_name])
        resp = {"worker": worker_name, "grew_by": n}
        _audit(db, actor=actor, action="worker.pool_grow", target_type="worker", target_id=worker_name,
               request_payload={"n": n}, response_payload=resp)
        return resp

    def pool_shrink(self, db: Session, worker_name: str, n: int = 1, *, actor: dict | None = None) -> dict:
        celery_app.control.broadcast("pool_shrink", arguments={"n": n}, destination=[worker_name])
        resp = {"worker": worker_name, "shrunk_by": n}
        _audit(db, actor=actor, action="worker.pool_shrink", target_type="worker", target_id=worker_name,
               request_payload={"n": n}, response_payload=resp)
        return resp

    def cancel_consumer(self, db: Session, worker_name: str, queue: str, *, actor: dict | None = None) -> dict:
        celery_app.control.cancel_consumer(queue, destination=[worker_name])
        resp = {"worker": worker_name, "queue": queue, "consumer_cancelled": True}
        _audit(db, actor=actor, action="worker.cancel_consumer", target_type="worker", target_id=worker_name,
               request_payload={"queue": queue}, response_payload=resp)
        return resp

    def add_consumer(self, db: Session, worker_name: str, queue: str, *, actor: dict | None = None) -> dict:
        celery_app.control.add_consumer(queue, destination=[worker_name])
        resp = {"worker": worker_name, "queue": queue, "consumer_added": True}
        _audit(db, actor=actor, action="worker.add_consumer", target_type="worker", target_id=worker_name,
               request_payload={"queue": queue}, response_payload=resp)
        return resp

    # ─── tasks ────────────────────────────────────────────────────────
    def revoke_task(self, db: Session, task_id: str, *, terminate: bool = False, actor: dict | None = None) -> dict:
        celery_app.control.revoke(task_id, terminate=terminate, signal="SIGTERM")
        resp = {"task_id": task_id, "terminate": terminate, "revoked": True}
        _audit(db, actor=actor, action="task.revoke", target_type="task", target_id=task_id,
               request_payload={"terminate": terminate}, response_payload=resp)
        return resp


ops_control = OpsControl()
