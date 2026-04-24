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
