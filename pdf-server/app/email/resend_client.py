"""Resend transactional sender.

Used when a tenant configures a `resend` email account: their own Resend
account and API key send all of that tenant's outbound mail.

Error mapping matches the other transports:
- 401/403 (bad key) / 422 (bad payload, unverified domain) -> PermanentSmtpError
- 429 / 5xx / network                                      -> TransientSmtpError
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Iterable, List, Optional

import httpx

from .attachments import LoadedAttachment
from .errors import PermanentSmtpError, TransientSmtpError

SEND_URL = "https://api.resend.com/emails"
SEND_TIMEOUT = 60.0


@dataclass(frozen=True)
class ResendCreds:
    kind: str
    account_id: str
    from_name: str
    from_email: str
    reply_to: Optional[str]
    send_delay_ms: int
    max_concurrency: int
    api_key: str


def _addr(name: Optional[str], email: str) -> str:
    return f"{name} <{email}>" if name else email


def _as_list(value) -> Optional[List[str]]:
    if not value:
        return None
    if isinstance(value, str):
        return [value]
    return [v for v in value if v]


def send_resend(
    creds: ResendCreds,
    *,
    to: str,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    reply_to: Optional[str] = None,
    from_name: Optional[str] = None,
    from_email: Optional[str] = None,
    subject: str,
    html: Optional[str] = None,
    text: Optional[str] = None,
    attachments: Optional[Iterable[LoadedAttachment]] = None,
    message_id: str,  # unused — Resend assigns its own id
) -> Optional[str]:
    """Send one email through Resend. Returns Resend's message id."""
    payload = {
        "from": _addr(from_name or creds.from_name, from_email or creds.from_email),
        "to": [to],
        "subject": subject,
    }
    if html:
        payload["html"] = html
    if text:
        payload["text"] = text
    if not html and not text:
        payload["text"] = ""
    if cc:
        payload["cc"] = _as_list(cc)
    if bcc:
        payload["bcc"] = _as_list(bcc)
    eff_reply_to = reply_to or creds.reply_to
    if eff_reply_to:
        payload["reply_to"] = _as_list(eff_reply_to)

    atts = list(attachments or [])
    if atts:
        payload["attachments"] = [
            {
                "filename": a.filename,
                "content": base64.b64encode(a.data).decode("ascii"),
                **({"content_type": a.content_type} if a.content_type else {}),
                **(
                    {"content_id": a.content_id, "content_disposition": "inline"}
                    if a.inline and a.content_id
                    else {}
                ),
            }
            for a in atts
        ]

    try:
        r = httpx.post(
            SEND_URL,
            json=payload,
            headers={"Authorization": f"Bearer {creds.api_key}"},
            timeout=SEND_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"resend send network: {exc}") from exc

    body = r.text[:600]
    if r.is_success:
        try:
            return r.json().get("id")
        except ValueError:
            return None
    if r.status_code in (401, 403):
        raise PermanentSmtpError(f"resend_auth {r.status_code}: {body}")
    if r.status_code == 429:
        raise TransientSmtpError(
            f"resend_rate_limited retry-after={r.headers.get('Retry-After', '?')}: {body}"
        )
    if 500 <= r.status_code < 600:
        raise TransientSmtpError(f"resend 5xx {r.status_code}: {body}")
    raise PermanentSmtpError(f"resend send failed {r.status_code}: {body}")
