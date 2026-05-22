from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CloudprinterCropArea(BaseModel):
    x: float
    y: float
    width: float
    height: float


class CloudprinterCrop(BaseModel):
    rotation: float = 0
    croppedAreaPixels: Optional[CloudprinterCropArea] = None


class CloudprinterJob(BaseModel):
    sequence_no: int
    source_url: str
    source_filename: str
    source_mime: str
    crop: Optional[CloudprinterCrop] = None
    target_w_px: int
    target_h_px: int
    quantity: int = Field(ge=1)
    output_basename: str
    jpeg_quality: int = 92


class CloudprinterRenderRequest(BaseModel):
    callback_url: str
    callback_token: str
    order_id: str
    submission_id: str
    reference: str
    jobs: List[CloudprinterJob]


class CloudprinterRenderResponse(BaseModel):
    render_job_id: str
