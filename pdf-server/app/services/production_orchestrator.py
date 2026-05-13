"""Production orchestrator.

Resolves an `order_jobs` row into the data we need to build production
artefacts (print-ready PDF, imposed sheet, job ticket) without the edge
function having to assemble inputs by hand.

Talks to Supabase using the existing service-role credentials already
configured for the storage layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from supabase import create_client, Client

from app.core.config import settings


@dataclass
class JobBundle:
    job: dict[str, Any]
    order: dict[str, Any] | None
    items: list[dict[str, Any]]
    documents: list[dict[str, Any]]   # documents table rows (job/order linked)
    asset_paths: list[tuple[str, str]]  # (filename, normalized_storage_path)
    tenant: dict[str, Any] | None
    customer: dict[str, Any] | None


def _client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase service-role credentials not configured on pdf-server.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def load_job_bundle(job_id: str) -> JobBundle:
    """Fetch everything needed to render production artefacts for one job."""
    sb = _client()

    job_res = sb.table("order_jobs").select("*").eq("id", job_id).single().execute()
    job = job_res.data
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    order = None
    if job.get("order_id"):
        try:
            order = sb.table("orders").select("*").eq("id", job["order_id"]).single().execute().data
        except Exception:
            order = None

    items = []
    if job.get("order_id"):
        items = (
            sb.table("order_items")
            .select("id, product_family_id, quantity, title, spec")
            .eq("order_id", job["order_id"])
            .execute()
            .data
            or []
        )

    # Customer-uploaded documents linked directly to this job
    documents = (
        sb.table("documents")
        .select("id, file_name, storage_path, backend_asset_id, metadata")
        .eq("job_id", job_id)
        .execute()
        .data
        or []
    )

    # Resolve assets → normalized PDF paths (preferred over raw storage_path).
    asset_ids = [d["backend_asset_id"] for d in documents if d.get("backend_asset_id")]
    asset_rows: dict[str, dict] = {}
    if asset_ids:
        rows = (
            sb.table("assets")
            .select("id, original_filename, normalized_storage_path, source_storage_path")
            .in_("id", asset_ids)
            .execute()
            .data
            or []
        )
        asset_rows = {r["id"]: r for r in rows}

    asset_paths: list[tuple[str, str]] = []
    for doc in documents:
        aid = doc.get("backend_asset_id")
        if aid and aid in asset_rows:
            row = asset_rows[aid]
            path = row.get("normalized_storage_path") or row.get("source_storage_path")
            if path:
                asset_paths.append((row.get("original_filename") or doc.get("file_name") or "doc.pdf", path))
        elif doc.get("storage_path"):
            asset_paths.append((doc.get("file_name") or "doc.pdf", doc["storage_path"]))

    tenant = None
    if job.get("tenant_id"):
        try:
            tenant = (
                sb.table("tenants")
                .select("id, name, display_name, slug, logo_url")
                .eq("id", job["tenant_id"])
                .single()
                .execute()
                .data
            )
        except Exception:
            tenant = None

    customer = None
    if order and order.get("created_by_profile_id"):
        try:
            customer = (
                sb.table("profiles")
                .select("id, full_name, email, phone")
                .eq("id", order["created_by_profile_id"])
                .single()
                .execute()
                .data
            )
        except Exception:
            customer = None

    return JobBundle(
        job=job,
        order=order,
        items=items,
        documents=documents,
        asset_paths=asset_paths,
        tenant=tenant,
        customer=customer,
    )


def write_artefact_path(job_id: str, column: str, storage_path: str) -> None:
    """Persist the artefact storage path back onto the order_jobs row."""
    if column not in {"print_ready_pdf_path", "imposed_pdf_path", "job_ticket_pdf_path"}:
        raise ValueError(f"Refusing to write to unexpected column {column!r}")
    sb = _client()
    sb.table("order_jobs").update({column: storage_path}).eq("id", job_id).execute()
