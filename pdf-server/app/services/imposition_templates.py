"""Imposition template loader.

Templates are managed in Supabase (`imposition_templates` table + private
`imposition-templates` storage bucket) by platform admins via the Lovable
admin UI. There are three kinds:

  * ``template_pdf``       — admin uploads a press-sheet PDF with marks /
                              colour bars baked in; the worker simply stamps
                              customer pages onto the slot rectangles.
  * ``parametric_nup``     — pure parameter bundle for ``impose_nup_trimbox``
                              (cut-sheet n-up, crop marks generated at
                              runtime). No template PDF needed.
  * ``parametric_booklet`` — pure parameter bundle for
                              ``booklet_saddle_stitch`` (signature ordering,
                              creep). No template PDF needed.

This module is the only place pdf-server reads from the
``imposition-templates`` bucket.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

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
    kind: str  # 'template_pdf' | 'parametric_nup' | 'parametric_booklet'
    n_up: int
    output_width_mm: float
    output_height_mm: float
    has_crop_marks: bool
    work_style: str

    # Press-sheet template fields (populated only for kind='template_pdf')
    template_pdf_path: Optional[str]
    slots: list[Slot] = field(default_factory=list)
    local_pdf: Optional[Path] = None

    # Parametric fields (populated for parametric_nup / parametric_booklet)
    columns: int = 1
    rows: int = 1
    bleed_mm: float = 3.0
    gutter_mm: float = 0.0
    crop_mark_offset_mm: float = 3.0
    crop_mark_length_mm: float = 5.0
    show_registration: bool = True
    creep_per_sheet_mm: float = 0.0
    fallback_trim_inset_mm: float = 0.0


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
    """Fetch a template row + (for kind='template_pdf') download its PDF."""
    sb = _client()
    row = (
        sb.table("imposition_templates")
        .select(
            "id, name, kind, n_up, output_width_mm, output_height_mm, "
            "has_crop_marks, work_style, template_pdf_path, slots, is_active, "
            "columns, rows, bleed_mm, gutter_mm, crop_mark_offset_mm, "
            "crop_mark_length_mm, show_registration, creep_per_sheet_mm, "
            "fallback_trim_inset_mm"
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

    kind = str(row.get("kind") or "template_pdf")

    if kind == "template_pdf":
        if not row.get("template_pdf_path"):
            raise ValueError(
                f"Imposition template '{row.get('name')}' has no template_pdf_path."
            )
        n_up = int(row.get("n_up") or 0)
        if n_up < 1:
            raise ValueError(f"Imposition template has invalid n_up ({n_up}).")
        slots = _coerce_slots(row.get("slots"), n_up)

        workspace_dir.mkdir(parents=True, exist_ok=True)
        local_pdf = workspace_dir / "template.pdf"
        data = sb.storage.from_(IMPOSITION_BUCKET).download(row["template_pdf_path"])
        local_pdf.write_bytes(data)

        return ImpositionTemplate(
            id=str(row["id"]),
            name=str(row.get("name") or ""),
            kind=kind,
            n_up=n_up,
            output_width_mm=float(row.get("output_width_mm") or 0),
            output_height_mm=float(row.get("output_height_mm") or 0),
            has_crop_marks=bool(row.get("has_crop_marks")),
            work_style=str(row.get("work_style") or "cut_sheet"),
            template_pdf_path=str(row["template_pdf_path"]),
            slots=slots,
            local_pdf=local_pdf,
        )

    if kind == "parametric_nup":
        cols = int(row.get("columns") or 0)
        rows_n = int(row.get("rows") or 0)
        if cols < 1 or rows_n < 1:
            raise ValueError(
                f"parametric_nup template '{row.get('name')}' must have columns >= 1 and rows >= 1."
            )
        n_up = int(row.get("n_up") or (cols * rows_n))
        return ImpositionTemplate(
            id=str(row["id"]),
            name=str(row.get("name") or ""),
            kind=kind,
            n_up=n_up,
            output_width_mm=float(row.get("output_width_mm") or 0),
            output_height_mm=float(row.get("output_height_mm") or 0),
            has_crop_marks=bool(row.get("has_crop_marks")),
            work_style=str(row.get("work_style") or "cut_sheet"),
            template_pdf_path=None,
            columns=cols,
            rows=rows_n,
            bleed_mm=float(row.get("bleed_mm") or 3.0),
            gutter_mm=float(row.get("gutter_mm") or 0.0),
            crop_mark_offset_mm=float(row.get("crop_mark_offset_mm") or 3.0),
            crop_mark_length_mm=float(row.get("crop_mark_length_mm") or 5.0),
            show_registration=bool(row.get("show_registration")),
            fallback_trim_inset_mm=float(row.get("fallback_trim_inset_mm") or 0.0),
        )

    if kind == "parametric_booklet":
        return ImpositionTemplate(
            id=str(row["id"]),
            name=str(row.get("name") or ""),
            kind=kind,
            n_up=int(row.get("n_up") or 2),
            output_width_mm=float(row.get("output_width_mm") or 0),
            output_height_mm=float(row.get("output_height_mm") or 0),
            has_crop_marks=bool(row.get("has_crop_marks")),
            work_style=str(row.get("work_style") or "sheetwise"),
            template_pdf_path=None,
            bleed_mm=float(row.get("bleed_mm") or 3.0),
            creep_per_sheet_mm=float(row.get("creep_per_sheet_mm") or 0.0),
        )

    raise ValueError(f"Unknown imposition template kind: {kind!r}")
