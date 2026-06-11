"""Microsoft Graph (Outlook / Microsoft 365) sender.

Mirrors the behaviour of the retired edge dispatcher's sendViaGraph:
- client_credentials flow against login.microsoftonline.com
- POST /v1.0/users/{sender}/sendMail with attachments inlined as base64
- 401/403 -> PermanentSmtpError (do not retry)
- 429 / 5xx / network -> TransientSmtpError (Celery autoretry)
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Iterable, List, Optional

import httpx

from .attachments import LoadedAttachment
from .errors import PermanentSmtpError, TransientSmtpError

TOKEN_TIMEOUT = 20.0
SEND_TIMEOUT = 60.0


@dataclass(frozen=True)
class GraphCreds:
    kind: str
    account_id: str
    from_name: str
    from_email: str
    reply_to: Optional[str]
    send_delay_ms: int
    max_concurrency: int
    azure_tenant_id: str
    client_id: str
    client_secret: str
    sender: str  # Graph sender mailbox address


def _recipients(addrs):
    if not addrs:
        return None
    if isinstance(addrs, str):
        addrs = [addrs]
    return [{"emailAddress": {"address": a}} for a in addrs if a]


def _get_token(creds: GraphCreds) -> str:
    url = f"https://login.microsoftonline.com/{creds.azure_tenant_id}/oauth2/v2.0/token"
    body = {
        "grant_type": "client_credentials",
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }
    try:
        r = httpx.post(url, data=body, timeout=TOKEN_TIMEOUT)
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"graph token network: {exc}") from exc
    if r.status_code in (401, 403):
        raise PermanentSmtpError(f"graph_auth token {r.status_code}: {r.text[:400]}")
    if not r.is_success:
        raise TransientSmtpError(f"graph token {r.status_code}: {r.text[:400]}")
    tok = r.json().get("access_token")
    if not tok:
        raise PermanentSmtpError("graph token response missing access_token")
    return tok


def send_graph(
    creds: GraphCreds,
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
    message_id: str,  # unused — Graph assigns its own
) -> Optional[str]:
    """Send via Graph. Returns the x-ms-request-id (best-effort message id)."""
    token = _get_token(creds)

    eff_reply_to = reply_to or creds.reply_to

    message = {
        "subject": subject,
        "body": {
            "contentType": "HTML" if html else "Text",
            "content": html or text or "",
        },
        "toRecipients": _recipients(to),
    }
    if cc:
        message["ccRecipients"] = _recipients(cc)
    if bcc:
        message["bccRecipients"] = _recipients(bcc)
    if eff_reply_to:
        message["replyTo"] = _recipients(eff_reply_to)

    atts = list(attachments or [])
    if atts:
        message["attachments"] = [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": a.filename,
                "contentType": a.content_type,
                "contentBytes": base64.b64encode(a.data).decode("ascii"),
                **(
                    {"contentId": a.content_id, "isInline": True}
                    if a.inline and a.content_id
                    else {}
                ),
            }
            for a in atts
        ]

    url = f"https://graph.microsoft.com/v1.0/users/{creds.sender}/sendMail"
    try:
        r = httpx.post(
            url,
            json={"message": message, "saveToSentItems": True},
            headers={"Authorization": f"Bearer {token}"},
            timeout=SEND_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"graph send network: {exc}") from exc

    if r.status_code == 202:
        return r.headers.get("x-ms-request-id")
    body = r.text[:600]
    if r.status_code in (401, 403):
        raise PermanentSmtpError(f"graph_auth {r.status_code}: {body}")
    if r.status_code == 429:
        raise TransientSmtpError(
            f"graph_rate_limited retry-after={r.headers.get('Retry-After', '?')}: {body}"
        )
    if 500 <= r.status_code < 600:
        raise TransientSmtpError(f"graph 5xx {r.status_code}: {body}")
    raise PermanentSmtpError(f"graph send failed {r.status_code}: {body}")
