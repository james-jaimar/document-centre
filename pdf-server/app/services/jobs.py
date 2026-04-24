from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

class JobRepository:
    def create_job(self, db: Session, asset_id: str | None, operation: str, queue: str, payload: dict) -> str:
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        db.execute(text("""
            insert into jobs (id, asset_id, operation, queue, status, payload, result, retries, created_at, updated_at)
            values (:id, :asset_id, :operation, :queue, 'queued', cast(:payload as jsonb), '{}'::jsonb, 0, :now, :now)
        """), {'id': job_id, 'asset_id': asset_id, 'operation': operation, 'queue': queue, 'payload': json.dumps(payload), 'now': now})
        db.commit()
        return job_id

    def set_celery_task_id(self, db: Session, job_id: str, task_id: str) -> None:
        db.execute(text('update jobs set celery_task_id=:task_id, updated_at=now() where id=:id'), {'id': job_id, 'task_id': task_id})
        db.commit()

    def mark_running(self, db: Session, job_id: str):
        db.execute(text("update jobs set status='running', started_at=now(), updated_at=now() where id=:id"), {'id': job_id})
        db.commit()

    def mark_done(self, db: Session, job_id: str, result: dict):
        db.execute(text("update jobs set status='completed', result=cast(:result as jsonb), finished_at=now(), updated_at=now() where id=:id"), {'id': job_id, 'result': json.dumps(result)})
        db.commit()

    def mark_failed(self, db: Session, job_id: str, error: str):
        db.execute(text("update jobs set status='failed', error=:error, finished_at=now(), updated_at=now() where id=:id"), {'id': job_id, 'error': error[:10000]})
        db.commit()

    def mark_cancelled(self, db: Session, job_id: str):
        db.execute(text("update jobs set status='cancelled', finished_at=now(), updated_at=now() where id=:id"), {'id': job_id})
        db.commit()

    def requeue(self, db: Session, job_id: str):
        db.execute(text("""
            update jobs
            set status='queued', error=null, started_at=null, finished_at=null, updated_at=now()
            where id=:id
        """), {'id': job_id})
        db.commit()

job_repo = JobRepository()
