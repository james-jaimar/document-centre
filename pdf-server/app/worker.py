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
        # Production-pipeline tasks (assemble print-ready, impose, render job ticket).
        "app.tasks.production_tasks",
        # PMP (printmypics) Cloudprinter render offload.
        "app.tasks.cloudprinter_tasks",
        # Outbound email pipeline — replaces the Supabase Edge dispatcher.
        "app.tasks.email_tasks",
    ],
)

celery_app.conf.update(
    task_default_queue="default",
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    timezone="UTC",
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_send_task_events=True,
    task_send_sent_event=True,
    broker_pool_limit=20,
    result_expires=3600,
    # Route email queues so dedicated workers can be spun up:
    #   celery -A app.worker worker -Q emails-default,emails-control -n emails@%h
    task_queues=None,  # let routing key match queue name
    task_routes={
        "email.scan_outbox": {"queue": "emails-control"},
        "email.release_stuck": {"queue": "emails-control"},
        "email.send": {"queue": "emails-default"},
    },
    beat_schedule={
        "ops-snapshot-storage-hourly": {
            "task": "ops.snapshot_storage",
            "schedule": crontab(minute=5),
        },
        "ops-cleanup-tmp-daily": {
            "task": "ops.cleanup_tmp",
            "schedule": crontab(hour=3, minute=30),
            "kwargs": {"max_age_hours": 24},
        },
        # Email outbox scan — every 5 seconds. Batch of 50 = ~600/min ceiling
        # with one worker; scale horizontally with more `emails-default` workers.
        "email-scan-outbox": {
            "task": "email.scan_outbox",
            "schedule": 5.0,
        },
        # Recover rows whose worker died mid-send.
        "email-release-stuck": {
            "task": "email.release_stuck",
            "schedule": 300.0,
        },
    },
)
