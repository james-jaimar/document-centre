"""Microsoft Graph delegated-OAuth sender.

Used for tenants that connected their Microsoft 365 / Outlook mailbox via the
self-serve `microsoft-oauth-connect` edge function (one multi-tenant Azure AD
app, authorization_code + refresh_token flow).

Distinct from `graph_client.send_graph`, which uses the older app-only
`client_credentials` flow with a per-account `graph_tenant_id` /
`graph_client_id` / `graph_client_secret`. That path remains for the
Document Centre mailbox; new tenants use this OAuth path.
"""
from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Iterable, List, Optional

import httpx

from .attachments import LoadedAttachment
from .errors import PermanentSmtpError, TransientSmtpError

TOKEN_TIMEOUT = 20.0
SEND_TIMEOUT = 60.0
AUTHORITY = "https://login.microsoftonline.com/common"
# Same scopes the edge function requested at consent time. Refresh tokens are
# scope-bound; asking for a different set here just fails.
SCOPES = "offline_access Mail.Send User.Read"


@dataclass(frozen=True)
class GraphOAuthCreds:
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


def _refresh_access_token(creds: GraphOAuthCreds) -> str:
    try:
        r = httpx.post(
            f"{AUTHORITY}/oauth2/v2.0/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": creds.refresh_token,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scope": SCOPES,
            },
            timeout=TOKEN_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"graph_oauth token network: {exc}") from exc
    if r.status_code in (400, 401, 403):
        # invalid_grant means refresh_token revoked → permanent.
        raise PermanentSmtpError(f"graph_oauth_auth token {r.status_code}: {r.text[:400]}")
    if not r.is_success:
        raise TransientSmtpError(f"graph_oauth token {r.status_code}: {r.text[:400]}")
    tok = r.json().get("access_token")
    if not tok:
        raise PermanentSmtpError("graph_oauth token response missing access_token")
    return tok


def _recipients(addrs):
    if not addrs:
        return None
    if isinstance(addrs, str):
        addrs = [addrs]
    return [{"emailAddress": {"address": a}} for a in addrs if a]


def send_graph_oauth(
    creds: GraphOAuthCreds,
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
    """Send via the signed-in user's mailbox (`/me/sendMail`).

    Delegated tokens are bound to the consented mailbox, so we POST to `/me`
    rather than `/users/{sender}` (which only works with app-only tokens +
    Mail.Send application permission).
    """
    token = _refresh_access_token(creds)

    eff_from_name = from_name or creds.from_name
    # NOTE: Microsoft Graph ignores the From header on delegated `/me/sendMail`
    # — the message is always sent as the consented mailbox. We still pass it
    # for parity / Sent-Items display.
    eff_from_email = from_email or creds.from_email
    eff_reply_to = reply_to or creds.reply_to

    message: dict = {
        "subject": subject,
        "body": {
            "contentType": "HTML" if html else "Text",
            "content": html or text or "",
        },
        "toRecipients": _recipients(to),
        "from": {"emailAddress": {"address": eff_from_email, "name": eff_from_name or ""}},
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

    try:
        r = httpx.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            json={"message": message, "saveToSentItems": True},
            headers={"Authorization": f"Bearer {token}"},
            timeout=SEND_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"graph_oauth send network: {exc}") from exc

    if r.status_code == 202:
        return r.headers.get("x-ms-request-id")
    body = r.text[:600]
    if r.status_code in (401, 403):
        raise PermanentSmtpError(f"graph_oauth_auth {r.status_code}: {body}")
    if r.status_code == 429:
        raise TransientSmtpError(
            f"graph_oauth_rate_limited retry-after={r.headers.get('Retry-After', '?')}: {body}"
        )
    if 500 <= r.status_code < 600:
        raise TransientSmtpError(f"graph_oauth 5xx {r.status_code}: {body}")
    raise PermanentSmtpError(f"graph_oauth send failed {r.status_code}: {body}")


def microsoft_oauth_client_id() -> Optional[str]:
    return os.getenv("MICROSOFT_OAUTH_CLIENT_ID")


def microsoft_oauth_client_secret() -> Optional[str]:
    return os.getenv("MICROSOFT_OAUTH_CLIENT_SECRET")
