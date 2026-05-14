"""Imposition template loader.

Templates are managed in Supabase (`imposition_templates` table + private
`imposition-templates` storage bucket) by platform admins via the Lovable
admin UI. The press-sheet artwork (with crop marks, colour bars, registration
marks already drawn in) is the source of truth for finishing — the worker
simply stamps customer pages onto each `slot` rectangle.

This module is the only place pdf-server reads from the
`imposition-templates` bucket.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from app.core.config import settings


IMPOSITION_BUCKET = "imposition-templates"


@dataclass(frozen=True)
class Slot:
    index: int
    x_mm: float
    y_mm: float
    width_mm: float
    height_mm: float
    rotation_deg: float = 0.0


@dataclass
class ImpositionTemplate:
    id: str
    name: str
    n_up: int
    output_width_mm: float
    output_height_mm: float
    has_crop_marks: bool
    work_style: str
    template_pdf_path: str
    slots: list[Slot]
    local_pdf: Path  # filled after download_template_pdf()


def _client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Supabase service-role credentials not configured on pdf-server."
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _coerce_slots(raw: Any, n_up: int) -> list[Slot]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("Template has no slots configured.")
    slots: list[Slot] = []
    for i, s in enumerate(raw):
        if not isinstance(s, dict):
            raise ValueError(f"Slot {i} is not an object.")
        try:
            slots.append(
                Slot(
                    index=int(s.get("index", i)),
                    x_mm=float(s["x_mm"]),
                    y_mm=float(s["y_mm"]),
                    width_mm=float(s["width_mm"]),
                    height_mm=float(s["height_mm"]),
                    rotation_deg=float(s.get("rotation_deg") or 0),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Slot {i} is missing required numeric fields: {exc}")
    slots.sort(key=lambda s: s.index)
    if len(slots) != n_up:
        raise ValueError(
            f"Template n_up ({n_up}) does not match slot count ({len(slots)})."
        )
    return slots


def load_imposition_template(template_id: str, workspace_dir: Path) -> ImpositionTemplate:
    """Fetch a template row + download its PDF into `workspace_dir`."""
    sb = _client()
    row = (
        sb.table("imposition_templates")
        .select(
            "id, name, n_up, output_width_mm, output_height_mm, "
            "has_crop_marks, work_style, template_pdf_path, slots, is_active"
        )
        .eq("id", template_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise ValueError(f"Imposition template not found: {template_id}")
    if not row.get("is_active"):
        raise ValueError(f"Imposition template is not active: {template_id}")
    if not row.get("template_pdf_path"):
        raise ValueError(f"Imposition template has no template_pdf_path: {template_id}")

    n_up = int(row.get("n_up") or 0)
    if n_up < 1:
        raise ValueError(f"Imposition template has invalid n_up ({n_up}).")

    slots = _coerce_slots(row.get("slots"), n_up)

    # Download template PDF from the private bucket via service-role.
    workspace_dir.mkdir(parents=True, exist_ok=True)
    local_pdf = workspace_dir / "template.pdf"
    data = sb.storage.from_(IMPOSITION_BUCKET).download(row["template_pdf_path"])
    local_pdf.write_bytes(data)

    return ImpositionTemplate(
        id=str(row["id"]),
        name=str(row.get("name") or ""),
        n_up=n_up,
        output_width_mm=float(row.get("output_width_mm") or 0),
        output_height_mm=float(row.get("output_height_mm") or 0),
        has_crop_marks=bool(row.get("has_crop_marks")),
        work_style=str(row.get("work_style") or "cut_sheet"),
        template_pdf_path=str(row["template_pdf_path"]),
        slots=slots,
        local_pdf=local_pdf,
    )
