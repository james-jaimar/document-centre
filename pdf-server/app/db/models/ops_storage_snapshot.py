from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class OpsStorageSnapshot(Base):
    """Hourly rollup of object storage usage. Snapshots are written by the
    Celery beat task `snapshot_storage_usage` and queried by the Storage
    admin page for the size-over-time chart."""

    __tablename__ = "ops_storage_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Storage backend identifier (e.g. "s3", "supabase", "local").
    backend: Mapped[str] = mapped_column(String(32), index=True)
    bucket: Mapped[str] = mapped_column(String(255), index=True)
    prefix: Mapped[str | None] = mapped_column(String(255), nullable=True)

    object_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    # Per-kind breakdown (e.g. {"thumbnails": 12345, "previews": 67890, "originals": ...}).
    breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
