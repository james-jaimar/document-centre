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
class TargetSpec:
    """Customer-chosen print spec, distilled from product_snapshot/configuration."""
    width_mm: float | None = None
    height_mm: float | None = None
    orientation: str | None = None  # "portrait" | "landscape"
    colour_mode: str = "colour"     # "colour" | "bw"
    print_to_edge: bool = False
    bleed_mm: float = 3.0


@dataclass
class JobBundle:
    job: dict[str, Any]
    order: dict[str, Any] | None
    items: list[dict[str, Any]]
    documents: list[dict[str, Any]]   # documents table rows (job/order linked)
    asset_paths: list[tuple[str, str]]  # (filename, normalized_storage_path)
    tenant: dict[str, Any] | None
    customer: dict[str, Any] | None
    target: TargetSpec = None  # type: ignore[assignment]


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
        target=_extract_target_spec(job),
    )


def write_artefact_path(job_id: str, column: str, storage_path: str) -> None:
    """Persist the artefact storage path back onto the order_jobs row."""
    if column not in {"print_ready_pdf_path", "imposed_pdf_path", "job_ticket_pdf_path"}:
        raise ValueError(f"Refusing to write to unexpected column {column!r}")
    sb = _client()
    sb.table("order_jobs").update({column: storage_path}).eq("id", job_id).execute()


def write_job_field(job_id: str, column: str, value) -> None:
    """Persist a metadata field back onto the order_jobs row.

    Allow-listed to columns the worker is allowed to touch.
    """
    if column not in {
        "imposition_template_id",
        "imposition_n_up",
        "assembly_report",
        "print_ready_assembled_at",
        "print_ready_spec_hash",
    }:
        raise ValueError(f"Refusing to write to unexpected column {column!r}")
    sb = _client()
    sb.table("order_jobs").update({column: value}).eq("id", job_id).execute()


# ---------------------------------------------------------------------------
# Target-spec extraction
# ---------------------------------------------------------------------------
# The customer-chosen spec is scattered across `product_snapshot.selected_options`
# (slug-based: a4, a5, portrait, landscape, bw, colour, print-to-edge, ...) and,
# for some product families, the top-level configuration summary. We sniff
# slugs/labels heuristically; the worker treats every value as optional.

_PAPER_SIZES_MM: dict[str, tuple[float, float]] = {
    "a3": (297.0, 420.0),
    "a4": (210.0, 297.0),
    "a5": (148.0, 210.0),
    "a6": (105.0, 148.0),
    "b5": (176.0, 250.0),
    "letter": (215.9, 279.4),
    "legal": (215.9, 355.6),
    "tabloid": (279.4, 431.8),
    "dl": (99.0, 210.0),
    "business_card": (90.0, 55.0),
    "business-card": (90.0, 55.0),
    "square_a4": (210.0, 210.0),
    "square_a5": (148.0, 148.0),
}


def _extract_target_spec(job: dict[str, Any]) -> TargetSpec:
    spec = TargetSpec()
    snap = job.get("product_snapshot") or {}
    cfg = job.get("configuration") or {}

    if snap.get("width_mm") and snap.get("height_mm"):
        try:
            spec.width_mm = float(snap["width_mm"])
            spec.height_mm = float(snap["height_mm"])
        except Exception:
            pass

    slugs: list[str] = []
    labels: list[str] = []
    for opt in (snap.get("selected_options") or []):
        s = (opt.get("slug") or "").lower()
        l = (opt.get("label") or "").lower()
        if s:
            slugs.append(s)
        if l:
            labels.append(l)

    blob = " ".join(slugs + labels)

    if spec.width_mm is None:
        for key, (w, h) in _PAPER_SIZES_MM.items():
            if key in slugs or key.replace("_", "-") in slugs:
                spec.width_mm, spec.height_mm = w, h
                break

    if "landscape" in blob:
        spec.orientation = "landscape"
    elif "portrait" in blob:
        spec.orientation = "portrait"
    elif spec.width_mm and spec.height_mm:
        spec.orientation = "landscape" if spec.width_mm > spec.height_mm else "portrait"

    if spec.orientation and spec.width_mm and spec.height_mm:
        is_landscape_canvas = spec.width_mm > spec.height_mm
        if spec.orientation == "landscape" and not is_landscape_canvas:
            spec.width_mm, spec.height_mm = spec.height_mm, spec.width_mm
        elif spec.orientation == "portrait" and is_landscape_canvas:
            spec.width_mm, spec.height_mm = spec.height_mm, spec.width_mm

    if any(k in slugs for k in ("bw", "black-and-white", "black_and_white", "greyscale", "grayscale", "mono")) \
       or "black and white" in blob or "black & white" in blob:
        spec.colour_mode = "bw"
    else:
        spec.colour_mode = "colour"

    cfg_colour = ""
    if isinstance(cfg, dict):
        cfg_colour = str(cfg.get("colour") or cfg.get("color") or "").lower()
    if cfg_colour in ("bw", "mono", "black", "black & white", "black and white", "greyscale", "grayscale"):
        spec.colour_mode = "bw"
    elif cfg_colour in ("colour", "color", "full colour", "full color"):
        spec.colour_mode = "colour"

    if any(k in blob for k in ("print-to-edge", "print_to_edge", "edge-to-edge", "bleed")):
        spec.print_to_edge = True
    if isinstance(cfg, dict) and cfg.get("print_to_edge") is True:
        spec.print_to_edge = True

    return spec

