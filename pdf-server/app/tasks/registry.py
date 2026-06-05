"""Task name → Celery task / plain callable registry.

Single source of truth used by:
  - ``app.core.queue.enqueue`` to dispatch by name (Celery or Cloud Tasks mode)
  - ``app.web.tasks_routes`` to execute by name when Cloud Tasks pushes
    an HTTP request to ``/internal/tasks/{task_name}``.

Adding a new task: import it and add it to ``TASK_REGISTRY`` below. Keep the
string name in sync with the Celery task name (the function name unless
``@celery_app.task(name=...)`` overrides it).
"""
from __future__ import annotations

from typing import Any, Callable, Dict

# Document / asset pipeline
from app.tasks.document_tasks import (
    normalize_asset,
    inspect_asset,
    rotate_pdf,
    grayscale_pdf,
    cmyk_pdf,
    resize_pdf,
    nup_pdf,
    impose_sheet_pdf,
    booklet_pdf,
    merge_pdfs,
    generate_previews,
    convert_office,
    normalize_orientation,
    print_ready,
    render_specific_pages,
    prepare_for_product,
    pad_pages_pdf,
    render_one_page,
)
from app.tasks.operation_tasks import generate_previews as op_generate_previews  # noqa: F401

# Production pipeline
from app.tasks.production_tasks import (
    assemble_print_ready_for_job,
    assemble_imposed_sheet_for_job,
    render_job_ticket_for_job,
)

# Cloudprinter
from app.tasks.cloudprinter_tasks import cloudprinter_render

# Email pipeline
from app.tasks.email_tasks import scan_outbox, send_email, release_stuck

# Ops
from app.tasks.ops_tasks import snapshot_storage, cleanup_tmp


TASK_REGISTRY: Dict[str, Callable[..., Any]] = {
    # documents
    "normalize_asset": normalize_asset,
    "inspect_asset": inspect_asset,
    "rotate_pdf": rotate_pdf,
    "grayscale_pdf": grayscale_pdf,
    "cmyk_pdf": cmyk_pdf,
    "resize_pdf": resize_pdf,
    "nup_pdf": nup_pdf,
    "impose_sheet_pdf": impose_sheet_pdf,
    "booklet_pdf": booklet_pdf,
    "merge_pdfs": merge_pdfs,
    "generate_previews": generate_previews,
    "convert_office": convert_office,
    "normalize_orientation": normalize_orientation,
    "print_ready": print_ready,
    "render_specific_pages": render_specific_pages,
    "prepare_for_product": prepare_for_product,
    "pad_pages_pdf": pad_pages_pdf,
    "render_one_page": render_one_page,
    # production
    "assemble_print_ready_for_job": assemble_print_ready_for_job,
    "assemble_imposed_sheet_for_job": assemble_imposed_sheet_for_job,
    "render_job_ticket_for_job": render_job_ticket_for_job,
    # cloudprinter
    "cloudprinter_render": cloudprinter_render,
    # email
    "scan_outbox": scan_outbox,
    "send_email": send_email,
    "release_stuck": release_stuck,
    # ops / beat
    "ops.snapshot_storage": snapshot_storage,
    "ops.cleanup_tmp": cleanup_tmp,
}


def resolve(task_name: str) -> Callable[..., Any]:
    try:
        return TASK_REGISTRY[task_name]
    except KeyError as e:
        raise KeyError(f"Unknown task: {task_name!r}. Add it to app.tasks.registry.TASK_REGISTRY") from e
