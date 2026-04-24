from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class OpsAuditLog(Base):
    """Audit trail for every privileged ops action (queue purge, worker shutdown,
    job revoke, asset reprocess, config change, etc.). Append-only."""

    __tablename__ = "ops_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Who performed the action — passed through from edge function via header.
    actor_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # What
    action: Mapped[str] = mapped_column(String(64), index=True)            # e.g. "queue.purge", "worker.shutdown"
    target_type: Mapped[str | None] = mapped_column(String(64), nullable=True)  # e.g. "queue", "worker", "asset"
    target_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)

    # Optional tenant attribution for analytics.
    tenant_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    app_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    # Outcome
    status: Mapped[str] = mapped_column(String(32), default="ok", index=True)  # ok | failed | partial
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Full request / response payload for forensics.
    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
