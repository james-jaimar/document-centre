"""Resolve per-tenant email account credentials.

The Supabase vault stores SMTP/OAuth secrets, decrypted via the existing
`read_email_account_secret(p_secret_id)` RPC (same one the edge dispatcher
uses). We mirror its behaviour by calling the RPC through the Supabase
service-role client — no need to re-implement vault crypto in Python.

Supports all active account transports, matching the retired edge dispatcher:
- smtp           → SmtpCreds (aiosmtplib)
- graph          → GraphCreds (Microsoft Graph sendMail)
- gmail_oauth    → GmailCreds (Gmail API users.messages.send)
- graph_oauth    → GraphOAuthCreds (delegated Microsoft Graph sendMail)
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Union

from supabase import Client

from .gmail_client import GmailCreds, gmail_oauth_client_id, gmail_oauth_client_secret
from .graph_client import GraphCreds
from .graph_oauth_client import (
    GraphOAuthCreds,
    _client_fp as graph_oauth_client_fp,
    microsoft_oauth_client_id,
    microsoft_oauth_client_secret,
)


@dataclass(frozen=True)
class SmtpCreds:
    kind: str
    account_id: str
    from_name: str
    from_email: str
    reply_to: Optional[str]
    send_delay_ms: int
    max_concurrency: int
    host: str
    port: int
    secure: str  # "tls" | "starttls" | "none"
    username: str
    password: str


AccountCreds = Union[SmtpCreds, GraphCreds, GmailCreds, GraphOAuthCreds]
SUPPORTED_EMAIL_TRANSPORTS = ("smtp", "graph", "gmail_oauth", "graph_oauth")

# id -> (creds, fetched_at_monotonic)
_CACHE: Dict[str, tuple[AccountCreds, float]] = {}
_CACHE_TTL_SECONDS = 300


class CredentialError(Exception):
    """Raised when an account row is missing required fields or vault read fails."""


def email_transport_diagnostics() -> Dict[str, Any]:
    """Expose non-secret runtime facts for health checks and deploy drift checks."""
    return {
        "supported": list(SUPPORTED_EMAIL_TRANSPORTS),
        "oauth_env_present": {
            "gmail_oauth": {
                "client_id": bool(gmail_oauth_client_id()),
                "client_secret": bool(gmail_oauth_client_secret()),
            },
            "graph_oauth": {
                "client_id": bool(microsoft_oauth_client_id()),
                "client_secret": bool(microsoft_oauth_client_secret()),
                "client_fp": graph_oauth_client_fp(microsoft_oauth_client_id() or ""),
            },
        },
    }


def _read_vault(sb: Client, secret_id: Optional[str]) -> Optional[str]:
    if not secret_id:
        return None
    res = sb.rpc("read_email_account_secret", {"p_secret_id": secret_id}).execute()
    return res.data if res.data else None


def _common_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    return dict(
        account_id=str(row["id"]),
        from_name=row.get("from_name") or "",
        from_email=row["from_email"],
        reply_to=row.get("reply_to"),
        send_delay_ms=int(row.get("send_delay_ms") or 0),
        max_concurrency=int(row.get("max_concurrency") or 4),
    )


def _build_from_row(sb: Client, row: Dict[str, Any]) -> AccountCreds:
    if not row.get("is_active"):
        raise CredentialError(f"account {row.get('id')} inactive")
    transport = (row.get("transport") or "smtp").lower()
    common = _common_fields(row)

    if transport == "smtp":
        password = _read_vault(sb, row.get("smtp_password_secret_id"))
        if not password:
            raise CredentialError(f"missing SMTP password for account {row.get('id')}")
        return SmtpCreds(
            kind="smtp",
            host=row["smtp_host"],
            port=int(row["smtp_port"]),
            secure=(row.get("smtp_secure") or "starttls").lower(),
            username=row["smtp_username"],
            password=password,
            **common,
        )

    if transport == "graph":
        client_secret = _read_vault(sb, row.get("graph_client_secret_id"))
        if not (
            client_secret
            and row.get("graph_tenant_id")
            and row.get("graph_client_id")
            and row.get("graph_sender_address")
        ):
            raise CredentialError(f"incomplete Graph config for account {row.get('id')}")
        return GraphCreds(
            kind="graph",
            azure_tenant_id=row["graph_tenant_id"],
            client_id=row["graph_client_id"],
            client_secret=client_secret,
            sender=row["graph_sender_address"],
            **common,
        )

    if transport == "gmail_oauth":
        refresh = _read_vault(sb, row.get("oauth_refresh_token_secret_id"))
        client_id = gmail_oauth_client_id()
        client_secret = gmail_oauth_client_secret()
        if not (refresh and client_id and client_secret and row.get("oauth_email")):
            raise CredentialError(
                f"incomplete Gmail OAuth config for account {row.get('id')} "
                f"(refresh={'y' if refresh else 'n'}, client_id_env={'y' if client_id else 'n'})"
            )
        return GmailCreds(
            kind="gmail_oauth",
            refresh_token=refresh,
            client_id=client_id,
            client_secret=client_secret,
            oauth_email=row["oauth_email"],
            **common,
        )

    if transport == "graph_oauth":
        refresh = _read_vault(sb, row.get("oauth_refresh_token_secret_id"))
        client_id = microsoft_oauth_client_id()
        client_secret = microsoft_oauth_client_secret()
        if not (refresh and client_id and client_secret and row.get("oauth_email")):
            raise CredentialError(
                f"incomplete Microsoft OAuth config for account {row.get('id')} "
                f"(refresh={'y' if refresh else 'n'}, client_id_env={'y' if client_id else 'n'})"
            )
        return GraphOAuthCreds(
            kind="graph_oauth",
            refresh_token=refresh,
            client_id=client_id,
            client_secret=client_secret,
            oauth_email=row["oauth_email"],
            **common,
        )

    # Include the running Cloud Run service+revision in the error so a stale
    # `not yet implemented in pdf-server` message is unambiguously traceable
    # to the exact revision that produced it (vs. inferring from the API
    # service's /health). Both env vars are set automatically by Cloud Run.
    import os as _os
    svc = _os.getenv("K_SERVICE") or "unknown-service"
    rev = _os.getenv("K_REVISION") or "unknown-revision"
    role = _os.getenv("ROLE") or "unknown-role"
    raise CredentialError(
        f"unknown transport {transport!r} for account {row.get('id')} "
        f"(svc={svc} rev={rev} role={role} "
        f"supported={','.join(SUPPORTED_EMAIL_TRANSPORTS)})"
    )


def get_account_creds(sb: Client, account_id: str, *, force_refresh: bool = False) -> AccountCreds:
    """Return cached creds; refresh from DB on miss or after TTL."""
    now = time.monotonic()
    if not force_refresh:
        hit = _CACHE.get(account_id)
        if hit and now - hit[1] < _CACHE_TTL_SECONDS:
            return hit[0]

    res = (
        sb.table("email_accounts")
        .select("*")
        .eq("id", account_id)
        .single()
        .execute()
    )
    if not res.data:
        raise CredentialError(f"account {account_id} not found")
    creds = _build_from_row(sb, res.data)
    _CACHE[account_id] = (creds, now)
    return creds


def invalidate(account_id: str) -> None:
    _CACHE.pop(account_id, None)


def resolve_account_id_for_row(
    sb: Client,
    *,
    tenant_id: Optional[str],
    branch_id: Optional[str],
) -> Optional[str]:
    """Mirror of the edge dispatcher's account fallback chain.

    Returns the id of the first usable active account (any transport),
    in order:
      1. branch default
      2. any branch
      3. tenant-wide default (no branch)
      4. any tenant-wide (no branch)
      5. any active account for this tenant
    """
    def _first_id(query) -> Optional[str]:
        rows = query.execute().data or []
        return rows[0]["id"] if rows else None

    def _platform_fallback() -> Optional[str]:
        # Platform-scope mail uses the platform-level default account (any
        # transport). No cross-tenant fallback — that would blur ownership.
        picked = _first_id(
            sb.table("email_accounts")
            .select("id,is_default,created_at")
            .is_("tenant_id", None)
            .is_("branch_id", None)
            .eq("is_active", True)
            .eq("is_default", True)
            .order("created_at", desc=False)
            .limit(1)
        )
        if picked:
            return picked

        return _first_id(
            sb.table("email_accounts")
            .select("id,is_default,created_at")
            .is_("tenant_id", None)
            .is_("branch_id", None)
            .eq("is_active", True)
            .order("created_at", desc=False)
            .limit(1)
        )

    if not tenant_id:
        return _platform_fallback()

    res = (
        sb.table("email_accounts")
        .select("id,branch_id,is_default,transport,is_active")
        .eq("tenant_id", tenant_id)
        .eq("is_active", True)
        .execute()
    )
    accounts = res.data or []

    def _pick(predicate) -> Optional[str]:
        for a in accounts:
            if predicate(a):
                return a["id"]
        return None

    if accounts:
        if branch_id:
            picked = _pick(lambda a: a.get("branch_id") == branch_id and a.get("is_default"))
            if picked:
                return picked
            picked = _pick(lambda a: a.get("branch_id") == branch_id)
            if picked:
                return picked

        picked = _pick(lambda a: not a.get("branch_id") and a.get("is_default"))
        if picked:
            return picked
        picked = _pick(lambda a: not a.get("branch_id"))
        if picked:
            return picked

        # Any active account for this tenant (last resort within tenant).
        return accounts[0]["id"]

    return _platform_fallback()

