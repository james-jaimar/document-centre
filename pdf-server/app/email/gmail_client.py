"""Gmail API sender using OAuth2 refresh-token flow.

Mirrors the edge dispatcher's sendViaGmail:
- refresh access_token via oauth2.googleapis.com/token
- assemble RFC 2822 with multipart/related for inline cids,
  multipart/mixed for regular attachments
- POST base64url(raw) to gmail.googleapis.com/gmail/v1/users/me/messages/send
"""
from __future__ import annotations

import base64
import os
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Iterable, List, Optional

import httpx

from .attachments import LoadedAttachment
from .errors import PermanentSmtpError, TransientSmtpError

TOKEN_TIMEOUT = 20.0
SEND_TIMEOUT = 60.0


@dataclass(frozen=True)
class GmailCreds:
    kind: str
    account_id: str
    from_name: str
    from_email: str
    reply_to: Optional[str]
    send_delay_ms: int
    max_concurrency: int
    refresh_token: str
    client_id: str
    client_secret: str
    oauth_email: str


def _refresh_access_token(creds: GmailCreds) -> str:
    try:
        r = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": creds.refresh_token,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
            },
            timeout=TOKEN_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"gmail token network: {exc}") from exc
    if r.status_code in (400, 401, 403):
        # 400 with invalid_grant means refresh_token is dead — permanent.
        raise PermanentSmtpError(f"gmail_auth token {r.status_code}: {r.text[:400]}")
    if not r.is_success:
        raise TransientSmtpError(f"gmail token {r.status_code}: {r.text[:400]}")
    tok = r.json().get("access_token")
    if not tok:
        raise PermanentSmtpError("gmail token response missing access_token")
    return tok


def _build_message(
    creds: GmailCreds,
    *,
    to: str,
    cc: Optional[List[str]],
    bcc: Optional[List[str]],
    reply_to: Optional[str],
    from_name: Optional[str],
    from_email: Optional[str],
    subject: str,
    html: Optional[str],
    text: Optional[str],
    attachments: List[LoadedAttachment],
) -> EmailMessage:
    """Build RFC 2822 using stdlib EmailMessage (handles cids/multipart for us)."""
    msg = EmailMessage()
    eff_from_email = from_email or creds.from_email
    eff_from_name = from_name or creds.from_name
    msg["From"] = f"{eff_from_name} <{eff_from_email}>" if eff_from_name else eff_from_email
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    if bcc:
        msg["Bcc"] = ", ".join(bcc)
    rt = reply_to or creds.reply_to
    if rt:
        msg["Reply-To"] = rt
    msg["Subject"] = subject

    body_text = text or ""
    body_html = html or ""

    if body_html and body_text:
        msg.set_content(body_text)
        msg.add_alternative(body_html, subtype="html")
    elif body_html:
        msg.set_content("This message requires an HTML-capable client.")
        msg.add_alternative(body_html, subtype="html")
    else:
        msg.set_content(body_text)

    for a in attachments:
        maintype, _, subtype = a.content_type.partition("/")
        msg.add_attachment(
            a.data,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=a.filename,
            cid=a.content_id if a.inline else None,
            disposition="inline" if a.inline else "attachment",
        )
    return msg


def send_gmail(
    creds: GmailCreds,
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
    message_id: str,  # unused — Gmail assigns id
) -> Optional[str]:
    token = _refresh_access_token(creds)
    msg = _build_message(
        creds,
        to=to,
        cc=cc,
        bcc=bcc,
        reply_to=reply_to,
        from_name=from_name,
        from_email=from_email,
        subject=subject,
        html=html,
        text=text,
        attachments=list(attachments or []),
    )
    raw_bytes = bytes(msg)
    raw_b64url = base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode("ascii")

    try:
        r = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            json={"raw": raw_b64url},
            headers={"Authorization": f"Bearer {token}"},
            timeout=SEND_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"gmail send network: {exc}") from exc

    if r.is_success:
        return r.json().get("id")
    body = r.text[:600]
    if r.status_code in (401, 403):
        raise PermanentSmtpError(f"gmail_auth {r.status_code}: {body}")
    if r.status_code == 429:
        raise TransientSmtpError(f"gmail_rate_limited: {body}")
    if 500 <= r.status_code < 600:
        raise TransientSmtpError(f"gmail 5xx {r.status_code}: {body}")
    raise PermanentSmtpError(f"gmail send failed {r.status_code}: {body}")


def gmail_oauth_client_id() -> Optional[str]:
    return os.getenv("GMAIL_OAUTH_CLIENT_ID")


def gmail_oauth_client_secret() -> Optional[str]:
    return os.getenv("GMAIL_OAUTH_CLIENT_SECRET")
