from typing import Any, Literal
from pydantic import BaseModel, Field
from uuid import UUID


class AssetCreate(BaseModel):
    original_filename: str
    media_type: str
    source_storage_path: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    auto_queue: bool = True
    source_url: str | None = None
    # When True (default), the route downloads the PDF once and runs a
    # pikepdf-only inspect inline so the response carries
    # page_count/width_pt/height_pt/boxes/mixed_orientation/status
    # synchronously. The client can then skip the legacy inspect_asset
    # Celery job + its queue hop entirely.
    # Ignored for non-PDF media types (Office files still need
    # convert_office before any inspection is possible).
    inline_inspect: bool = True


class AssetResponse(BaseModel):
    id: UUID
    original_filename: str
    media_type: str
    source_storage_path: str
    normalized_storage_path: str | None = None
    preview_storage_path: str | None = None
    thumbnail_storage_path: str | None = None
    status: str
    page_count: int | None = None
    width_pt: float | None = None
    height_pt: float | None = None
    boxes: dict[str, Any] | None = None
    metadata: dict[str, Any]
    source_url: str | None = None
    normalized_url: str | None = None
    preview_url: str | None = None
    thumbnail_url: str | None = None


class DerivedFileResponse(BaseModel):
    id: UUID
    asset_id: UUID | None = None
    job_id: UUID | None = None
    kind: str
    storage_path: str
    media_type: str
    page: int | None = None
    width: int | None = None
    height: int | None = None
    metadata: dict[str, Any]
    url: str | None = None


class JobResponse(BaseModel):
    id: UUID
    asset_id: UUID | None = None
    operation: str
    queue: str
    status: str
    payload: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    error: str | None = None


class RotateRequest(BaseModel):
    asset_id: UUID
    angle: Literal[90, 180, 270] = 90


class GrayscaleRequest(BaseModel):
    asset_id: UUID


class CmykRequest(BaseModel):
    asset_id: UUID
    icc_profile: str | None = None


class ResizeRequest(BaseModel):
    asset_id: UUID
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)
    fit_mode: Literal["fit", "fill"] = "fit"
    dominant_orientation: Literal["portrait", "landscape"] | None = None
    # When True and the source page declares a TrimBox smaller than its
    # MediaBox (i.e. it carries bleed + crop marks), the trim area is
    # scaled to the target and the bleed margin is proportionally
    # preserved around it. Source crop marks fall outside the new
    # MediaBox and are dropped from the visible canvas.
    respect_trim_box: bool = False


class NupRequest(BaseModel):
    asset_id: UUID
    columns: int = Field(ge=1)
    rows: int = Field(ge=1)
    page_width_mm: float = Field(gt=0)
    page_height_mm: float = Field(gt=0)


class BookletRequest(BaseModel):
    asset_id: UUID
    sheet_width_mm: float = Field(gt=0)
    sheet_height_mm: float = Field(gt=0)


class MergeRequest(BaseModel):
    asset_ids: list[UUID]
    output_filename: str = "merged.pdf"

class SheetImposeRequest(BaseModel):
    asset_id: UUID
    columns: int = Field(ge=1, default=2)
    rows: int = Field(ge=1, default=2)
    sheet_width_mm: float = Field(gt=0)
    sheet_height_mm: float = Field(gt=0)
    bleed_mm: float = Field(ge=0, default=3)
    gap_mm: float = Field(ge=0, default=2)
    outer_margin_mm: float = Field(ge=0, default=8)
    show_crop_marks: bool = True
    show_bleed_outline: bool = False
    result_upload_url: str | None = None

class CropRasterizeRequest(BaseModel):
    asset_id: UUID
    box: list[float] = Field(min_length=4, max_length=4)
    dpi: int = Field(default=120, ge=36, le=600)


class GeneratePreviewsRequest(BaseModel):
    """Trigger the optimised single-pass preview/thumbnail render.

    Optional ``render_box`` (PDF user-space points [x0, y0, x1, y1]) crops
    the source to the target print area before rasterizing — typically the
    asset's TrimBox after a user resolves a bleed advisory.
    """
    asset_id: UUID
    render_box: list[float] | None = Field(default=None, min_length=4, max_length=4)

class ConvertOfficeRequest(BaseModel):
    asset_id: UUID


class NormalizeOrientationRequest(BaseModel):
    asset_id: UUID
    dominant: Literal["portrait", "landscape"] = "portrait"


class PrintReadyRequest(BaseModel):
    asset_id: UUID
    intent: Literal[
        "relative_colorimetric",
        "perceptual",
        "absolute_colorimetric",
        "saturation",
    ] = "relative_colorimetric"
    dest_profile: str = "fogra39"
    # Server-side chaining: when True, after print_ready completes the
    # worker enqueues generate_previews against ``chain_render_box``
    # automatically. The response then includes ``preview_job_id`` so the
    # client can skip the print_ready poll entirely and only watch the
    # downstream preview job.
    chain_generate_previews: bool = False
    chain_render_box: list[float] | None = Field(default=None, min_length=4, max_length=4)
    dominant_orientation: Literal["portrait", "landscape"] | None = None


class RenderPagesRequest(BaseModel):
    """Request a surgical re-render of one or more pages of an existing asset.

    ``pages`` accepts either an explicit list of 1-based page numbers, or
    the literal string ``"missing"`` meaning "scan derived_files and
    re-render anything not already present".
    """
    pages: list[int] | Literal["missing"] = "missing"


class PrepareForProductRequest(BaseModel):
    """One-shot PDF preparation: CMYK → orient → resize.

    The frontend sends a single request describing what the product needs.
    The server performs all mutations in the correct order and promotes one
    final PDF. No more multi-job sequencing on the client side.
    """
    asset_id: UUID
    dominant_orientation: Literal["portrait", "landscape"] | None = None
    target_width_mm: float | None = Field(default=None, gt=0)
    target_height_mm: float | None = Field(default=None, gt=0)
    fit_mode: Literal["fit", "fill"] = "fit"
    dest_profile: str | None = None
    intent: Literal[
        "relative_colorimetric",
        "perceptual",
        "absolute_colorimetric",
        "saturation",
    ] = "relative_colorimetric"
    # See ResizeRequest.respect_trim_box.
    respect_trim_box: bool = False
    # Server-side chaining (mirrors PrintReadyRequest): when True the worker
    # enqueues generate_previews against ``chain_render_box`` as its final
    # step. The response then includes ``preview_job_id`` so the client
    # skips the prepare poll entirely and only watches the preview job.
    chain_generate_previews: bool = False
    chain_render_box: list[float] | None = Field(default=None, min_length=4, max_length=4)


class JobArtefactRequest(BaseModel):
    """Production-pipeline request keyed off an `order_jobs.id`.

    The pdf-server resolves all inputs (source PDFs, product spec, tenant
    branding) directly from Supabase using its service-role credentials,
    so the caller only needs to supply the job id.

    `imposition_template_id` is optional and only used by the impose endpoint;
    when present, the template-driven imposition path runs instead of the
    legacy product-aware strategy.
    """
    job_id: UUID
    imposition_template_id: UUID | None = None
    force: bool = False


class PadPagesRequest(BaseModel):
    """Pad a PDF with blank pages so total count is divisible by `multiple`.

    Used for saddle-stitched booklets where each folded sheet has 4 faces.
    """
    asset_id: UUID
    multiple: int = Field(default=4, ge=2)
