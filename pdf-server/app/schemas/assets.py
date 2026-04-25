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
