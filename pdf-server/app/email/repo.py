"""DB helpers for the email pipeline.

Uses the Supabase service-role REST client (already used elsewhere on the
pdf-server) rather than SQLAlchemy so we go through PostgREST + RLS and
share connection limits cleanly.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# Backoff ladder in minutes (matches existing edge dispatcher)
BACKOFF_MIN = [1, 5, 15, 60, 360]


def next_attempt_at(attempts: int) -> str:
    from datetime import timedelta
    idx = min(attempts, len(BACKOFF_MIN) - 1)
    return (datetime.now(timezone.utc) + timedelta(minutes=BACKOFF_MIN[idx])).isoformat()


def claim_batch(sb: Client, worker_id: str, batch_size: int, lease_seconds: int) -> List[Dict[str, Any]]:
    res = sb.rpc(
        "claim_email_batch",
        {"p_worker_id": worker_id, "p_batch_size": batch_size, "p_lease_seconds": lease_seconds},
    ).execute()
    return res.data or []


def release_stuck(sb: Client) -> int:
    res = sb.rpc("release_stuck_claims", {}).execute()
    return int(res.data or 0)


def mark_sent(sb: Client, outbox_id: str, *, provider: str, message_id: str) -> None:
    sb.table("email_outbox").update({
        "status": "sent",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "provider_message_id": message_id,
        "error_message": None,
        "last_error_code": None,
        "claimed_by": None,
        "claimed_at": None,
        "worker_lease_until": None,
    }).eq("id", outbox_id).in_("status", ["sending"]).execute()


def mark_retry(
    sb: Client,
    outbox_id: str,
    *,
    attempts: int,
    error: str,
    error_code: Optional[str] = None,
) -> None:
    sb.table("email_outbox").update({
        "status": "retry",
        "scheduled_for": next_attempt_at(attempts),
        "error_message": error[:2000],
        "last_error_code": error_code,
        "claimed_by": None,
        "claimed_at": None,
        "worker_lease_until": None,
    }).eq("id", outbox_id).execute()


def mark_failed(sb: Client, outbox_id: str, *, error: str, error_code: Optional[str] = None, dlq: bool = False) -> None:
    sb.table("email_outbox").update({
        "status": "dlq" if dlq else "failed",
        "error_message": error[:2000],
        "last_error_code": error_code,
        "claimed_by": None,
        "claimed_at": None,
        "worker_lease_until": None,
    }).eq("id", outbox_id).execute()


def is_suppressed(sb: Client, email: str) -> bool:
    res = (
        sb.table("email_suppressions")
        .select("email")
        .eq("email", email.lower())
        .limit(1)
        .execute()
    )
    return bool(res.data)


def record_metric(
    sb: Client,
    *,
    tenant_id: Optional[str],
    email_account_id: Optional[str],
    sent: bool,
    latency_ms: int,
) -> None:
    """Upsert per-minute metric bucket."""
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()
    # Best-effort: a single failure here must not break sending.
    try:
        existing = (
            sb.table("email_send_metrics")
            .select("id,sent_count,failed_count,avg_latency_ms")
            .eq("bucket_at", now)
            .eq("tenant_id", tenant_id)
            .eq("email_account_id", email_account_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            n_total = row["sent_count"] + row["failed_count"] + 1
            new_avg = int((row["avg_latency_ms"] * (n_total - 1) + latency_ms) / n_total)
            sb.table("email_send_metrics").update({
                "sent_count": row["sent_count"] + (1 if sent else 0),
                "failed_count": row["failed_count"] + (0 if sent else 1),
                "avg_latency_ms": new_avg,
            }).eq("id", row["id"]).execute()
        else:
            sb.table("email_send_metrics").insert({
                "bucket_at": now,
                "tenant_id": tenant_id,
                "email_account_id": email_account_id,
                "sent_count": 1 if sent else 0,
                "failed_count": 0 if sent else 1,
                "avg_latency_ms": latency_ms,
            }).execute()
    except Exception:  # noqa: BLE001
        pass


def worker_id() -> str:
    return f"pdf-server:{os.uname().nodename}:{os.getpid()}"
