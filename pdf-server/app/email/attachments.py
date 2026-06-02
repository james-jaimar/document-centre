"""Download email attachments from Supabase Storage.

Attachment specs live on email_outbox.attachments as JSON:
    [{filename, storage_bucket, storage_path, content_type, content_id?, inline?}]

Mirrors the edge dispatcher behaviour: 20 MB total cap per email.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

from supabase import Client

from .config import email_settings


@dataclass(frozen=True)
class LoadedAttachment:
    filename: str
    content_type: str
    data: bytes
    content_id: Optional[str] = None
    inline: bool = False


class AttachmentError(Exception):
    pass


def load_attachments(sb: Client, specs: Optional[Iterable[dict]]) -> List[LoadedAttachment]:
    if not specs:
        return []
    total = 0
    out: List[LoadedAttachment] = []
    for s in specs:
        bucket = s["storage_bucket"]
        path = s["storage_path"]
        try:
            data = sb.storage.from_(bucket).download(path)
        except Exception as exc:  # noqa: BLE001
            raise AttachmentError(f"attachment_download_failed: {path} ({exc})") from exc
        total += len(data)
        if total > email_settings.max_attachment_bytes:
            raise AttachmentError(
                f"attachment_too_large: total exceeds {email_settings.max_attachment_bytes} bytes"
            )
        out.append(
            LoadedAttachment(
                filename=s["filename"],
                content_type=s.get("content_type") or "application/octet-stream",
                data=data,
                content_id=s.get("content_id"),
                inline=bool(s.get("inline")),
            )
        )
    return out
