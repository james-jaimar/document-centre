"""Task queue abstraction.

Phase 2 of the GCP cutover replaces the Celery+Redis broker with Cloud Tasks
(HTTP push) and Cloud Scheduler (beat). The runtime path is selected by the
``QUEUE_BACKEND`` env var:

  - ``celery`` (default, legacy/VPS): existing ``task.delay(...)`` /
    ``task.apply_async(...)`` paths are used unchanged. This file's
    ``enqueue()`` falls back to Celery's apply_async.

  - ``cloud_tasks``: ``enqueue()`` calls Cloud Tasks ``CreateTask`` with an
    authenticated HTTP request targeting the appropriate worker service's
    ``/internal/tasks/{task_name}`` endpoint.

Both modes share the same task name → callable registry in
``app.tasks.registry`` so HTTP workers can dispatch by name.

Env vars (Cloud Tasks mode):
  QUEUE_BACKEND=cloud_tasks
  GCP_PROJECT_ID=project-59a14b18-b4df-4c6b-b09
  GCP_REGION=africa-south1        # Cloud Run (compute) region
  GCP_TASKS_REGION=europe-west1   # Cloud Tasks + Scheduler region
                                  # (Tasks/Scheduler not offered in africa-south1;
                                  #  falls back to GCP_REGION if unset)
  TASKS_INVOKER_SA=cloud-tasks-invoker@<project>.iam.gserviceaccount.com
  WORKER_URL_HEAVY=https://pdf-worker-heavy-<hash>.run.app
  WORKER_URL_LIGHT=https://pdf-worker-light-<hash>.run.app
  WORKER_URL_EMAILS=https://pdf-worker-emails-<hash>.run.app
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterable, Mapping

log = logging.getLogger("queue")

QUEUE_BACKEND = os.getenv("QUEUE_BACKEND", "celery").lower()

# Logical queue → worker service URL env var.
QUEUE_TO_WORKER_ENV: dict[str, str] = {
    "documents": "WORKER_URL_HEAVY",
    "imposition": "WORKER_URL_HEAVY",
    "pdf": "WORKER_URL_HEAVY",
    "default": "WORKER_URL_LIGHT",
    "thumbnails": "WORKER_URL_LIGHT",
    "emails-default": "WORKER_URL_EMAILS",
    "emails-control": "WORKER_URL_EMAILS",
}

# Logical queue → Cloud Tasks queue id (must match gcp-tasks-bootstrap.sh).
QUEUE_TO_CLOUD_TASKS_QUEUE: dict[str, str] = {
    "documents": "documents-heavy",
    "imposition": "documents-heavy",
    "pdf": "documents-heavy",
    "default": "documents-light",
    "thumbnails": "documents-light",
    "emails-default": "emails-default",
    "emails-control": "emails-control",
}


def _resolve_worker_url(queue: str) -> str:
    env_var = QUEUE_TO_WORKER_ENV.get(queue)
    if not env_var:
        raise ValueError(f"Unknown logical queue: {queue!r}")
    url = os.getenv(env_var)
    if not url:
        raise RuntimeError(
            f"Cloud Tasks mode requires env var {env_var} to point at the worker service URL"
        )
    return url.rstrip("/")


def _cloud_tasks_enqueue(
    task_name: str,
    args: Iterable[Any],
    kwargs: Mapping[str, Any],
    queue: str,
) -> str:
    # Imported lazily so the legacy/Celery path never loads google-cloud-tasks.
    from google.cloud import tasks_v2  # type: ignore

    project = os.environ["GCP_PROJECT_ID"]
    # Tasks/Scheduler region is independent of compute region (africa-south1
    # doesn't host Cloud Tasks). Fall back to GCP_REGION for back-compat.
    region = os.getenv("GCP_TASKS_REGION") or os.environ["GCP_REGION"]
    invoker_sa = os.environ["TASKS_INVOKER_SA"]
    queue_id = QUEUE_TO_CLOUD_TASKS_QUEUE[queue]
    worker_url = _resolve_worker_url(queue)

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(project, region, queue_id)
    body = json.dumps({"args": list(args), "kwargs": dict(kwargs)}).encode("utf-8")
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{worker_url}/internal/tasks/{task_name}",
            "headers": {"Content-Type": "application/json"},
            "body": body,
            "oidc_token": {
                "service_account_email": invoker_sa,
                "audience": worker_url,
            },
        }
    }
    response = client.create_task(request={"parent": parent, "task": task})
    log.info("enqueued cloud task name=%s queue=%s task=%s", task_name, queue_id, response.name)
    return response.name


def enqueue(task_name: str, *args: Any, queue: str = "default", **kwargs: Any) -> str:
    """Enqueue a task by name. Returns a backend-specific id."""
    if QUEUE_BACKEND == "cloud_tasks":
        return _cloud_tasks_enqueue(task_name, args, kwargs, queue)

    # Legacy Celery path. Resolve the task via the registry to avoid a
    # mass-rename of every `task.delay(...)` call site in Phase 2.
    from app.tasks.registry import TASK_REGISTRY
    task = TASK_REGISTRY[task_name]
    result = task.apply_async(args=list(args), kwargs=dict(kwargs), queue=queue)
    return result.id
