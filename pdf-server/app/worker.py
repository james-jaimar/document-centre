from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "printforge",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.document_tasks",
        "app.tasks.operation_tasks",
        "app.tasks.ops_tasks",
    ],
)

celery_app.conf.update(
    task_default_queue="default",
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    timezone="UTC",
    # ---- Resilience / fairness tuning ----------------------------------
    # Don't let a heavy worker hoard a queue of small jobs while it grinds
    # through a single LibreOffice run. With prefetch=1 each child pulls
    # exactly one task at a time, so the scheduler can rebalance fairly.
    worker_prefetch_multiplier=1,
    # Acknowledge tasks AFTER they complete, so a crashed child (OOM,
    # SIGKILL from --max-memory-per-child) re-queues the job instead of
    # silently dropping it.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Emit task lifecycle events so the platform Workers UI
    # (PlatformDocumentCentreWorkers) can show live activity counts.
    worker_send_task_events=True,
    task_send_sent_event=True,
    # Larger broker pool for the multi-worker setup (heavy + light + beat).
    broker_pool_limit=20,
    # Keep result rows for 1 hour — enough for the UI to poll, not enough
    # to bloat redis.
    result_expires=3600,
    beat_schedule={
        "ops-snapshot-storage-hourly": {
            "task": "ops.snapshot_storage",
            "schedule": crontab(minute=5),  # 5 past every hour
        },
        "ops-cleanup-tmp-daily": {
            "task": "ops.cleanup_tmp",
            "schedule": crontab(hour=3, minute=30),  # 03:30 UTC daily
            "kwargs": {"max_age_hours": 24},
        },
    },
)
