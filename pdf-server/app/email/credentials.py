"""Resolve per-tenant email account credentials.

The Supabase vault stores SMTP/OAuth secrets, decrypted via the existing
`read_email_account_secret(p_secret_id)` RPC (same one the edge dispatcher
uses). We mirror its behaviour by calling the RPC through the Supabase
service-role client — no need to re-implement vault crypto in Python.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from supabase import Client

# id -> (creds, fetched_at_monotonic)
_CACHE: Dict[str, tuple["AccountCreds", float]] = {}
_CACHE_TTL_SECONDS = 300


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


# Future: GraphCreds, GmailCreds. Same shape minus host/port/etc.
AccountCreds = SmtpCreds


class CredentialError(Exception):
    """Raised when an account row is missing required fields or vault read fails."""


def _read_vault(sb: Client, secret_id: Optional[str]) -> Optional[str]:
    if not secret_id:
        return None
    res = sb.rpc("read_email_account_secret", {"p_secret_id": secret_id}).execute()
    return res.data if res.data else None


def _build_from_row(sb: Client, row: Dict[str, Any]) -> AccountCreds:
    if not row.get("is_active"):
        raise CredentialError(f"account {row.get('id')} inactive")
    transport = row.get("transport") or "smtp"
    if transport != "smtp":
        # Graph / Gmail OAuth deliberately deferred — keep current edge
        # function handling them until we extend this module.
        raise CredentialError(f"transport {transport} not yet implemented in pdf-server")

    password = _read_vault(sb, row.get("smtp_password_secret_id"))
    if not password:
        raise CredentialError(f"missing SMTP password for account {row.get('id')}")

    return SmtpCreds(
        kind="smtp",
        account_id=str(row["id"]),
        from_name=row.get("from_name") or "",
        from_email=row["from_email"],
        reply_to=row.get("reply_to"),
        send_delay_ms=int(row.get("send_delay_ms") or 0),
        max_concurrency=int(row.get("max_concurrency") or 4),
        host=row["smtp_host"],
        port=int(row["smtp_port"]),
        secure=(row.get("smtp_secure") or "starttls").lower(),
        username=row["smtp_username"],
        password=password,
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
