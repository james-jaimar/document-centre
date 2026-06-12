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
import hashlib
import os
from dataclasses import dataclass
from typing import Callable, Iterable, List, Optional

import httpx

from .attachments import LoadedAttachment
from .errors import PermanentSmtpError, TransientSmtpError


def _client_fp(client_id: str) -> str:
    """Non-secret fingerprint of the OAuth client_id (first 8 hex of sha256).

    Lets us cross-check that the Edge Function and Cloud Run worker use the
    SAME Entra app without ever logging the client_id itself.
    """
    if not client_id:
        return "absent"
    return hashlib.sha256(client_id.encode("utf-8")).hexdigest()[:8]

TOKEN_TIMEOUT = 20.0
SEND_TIMEOUT = 60.0
AUTHORITY = "https://login.microsoftonline.com/common"
# Microsoft's documented delegated Graph scope string. Use the SAME string
# the Edge Function used at authorize-time. Refresh scope is optional and
# must be equivalent-or-subset; the short form `Mail.Send User.Read` is what
# Microsoft's own examples show for delegated Graph access.
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


@dataclass(frozen=True)
class TokenRefreshResult:
    access_token: str
    refresh_token: Optional[str] = None


def _refresh_access_token(creds: GraphOAuthCreds) -> TokenRefreshResult:
    # Vault round-trips sometimes leave a trailing newline on the secret;
    # AADSTS90013 ("Invalid input received from the user") is what Microsoft
    # returns when the refresh_token has stray whitespace, so strip it.
    refresh_token = (creds.refresh_token or "").strip()
    try:
        r = httpx.post(
            f"{AUTHORITY}/oauth2/v2.0/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scope": SCOPES,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=TOKEN_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise TransientSmtpError(f"graph_oauth token network: {exc}") from exc
    if r.status_code in (400, 401, 403):
        # invalid_grant means refresh_token revoked → permanent.
        raise PermanentSmtpError(
            f"graph_oauth_auth token {r.status_code} "
            f"(refresh_len={len(refresh_token)}, "
            f"client_fp={_client_fp(creds.client_id)}, "
            f"client_secret_present={bool(creds.client_secret)}): "
            f"{r.text[:400]}"
        )
    if not r.is_success:
        raise TransientSmtpError(f"graph_oauth token {r.status_code}: {r.text[:400]}")
    payload = r.json()
    tok = payload.get("access_token")
    if not tok:
        raise PermanentSmtpError("graph_oauth token response missing access_token")
    replacement_refresh = (payload.get("refresh_token") or "").strip() or None
    return TokenRefreshResult(access_token=tok, refresh_token=replacement_refresh)


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
    refresh_token_updater: Optional[Callable[[str], None]] = None,
) -> Optional[str]:
    """Send via the signed-in user's mailbox (`/me/sendMail`).

    Delegated tokens are bound to the consented mailbox, so we POST to `/me`
    rather than `/users/{sender}` (which only works with app-only tokens +
    Mail.Send application permission).
    """
    refreshed = _refresh_access_token(creds)
    token = refreshed.access_token
    current_refresh = (creds.refresh_token or "").strip()
    if refreshed.refresh_token and refreshed.refresh_token != current_refresh:
        if refresh_token_updater is None:
            raise TransientSmtpError("graph_oauth refresh rotation missing updater")
        try:
            refresh_token_updater(refreshed.refresh_token)
        except Exception as exc:  # noqa: BLE001
            raise TransientSmtpError(f"graph_oauth refresh rotation persist failed: {exc}") from exc

    # Microsoft Graph determines the sender from the delegated token on
    # `/me/sendMail`; passing a custom `from` is ignored and can be rejected.
    eff_reply_to = reply_to or creds.reply_to

    message: dict = {
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
