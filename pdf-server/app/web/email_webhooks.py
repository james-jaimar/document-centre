"""Email webhook endpoints (bounce / complaint / delivery).

Generic provider-agnostic shape. Per-provider HMAC verification can be
plugged in later via env-configured secrets — for now we accept events
authenticated with a shared `EMAIL_WEBHOOK_SECRET` header.

Each event is recorded in `email_events`; bounces and complaints also add
to `email_suppressions` to block future sends.
"""
from __future__ import annotations

import hmac
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request

from app.email import repo

email_webhooks_router = APIRouter(prefix="/v1/webhooks/email", tags=["email"])

_WEBHOOK_SECRET = os.getenv("EMAIL_WEBHOOK_SECRET", "")

_SUPPRESS_TYPES = {"bounce", "hard_bounce", "complaint", "spam"}


def _check_auth(token: Optional[str]) -> None:
    if not _WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="webhook secret not configured")
    if not token or not hmac.compare_digest(token, _WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="invalid webhook token")


def _record_event(payload: Dict[str, Any]) -> None:
    sb = repo.get_supabase()
    event_type = (payload.get("event_type") or "").lower()
    recipient = (payload.get("recipient") or "").lower() or None
    provider_message_id = payload.get("provider_message_id")
    raw = payload.get("raw") or payload

    # Idempotent insert via the unique constraint on (msgid,type,recipient)
    try:
        sb.table("email_events").insert({
            "event_type": event_type,
            "recipient": recipient,
            "provider_message_id": provider_message_id,
            "raw": raw,
        }).execute()
    except Exception:  # noqa: BLE001
        pass

    if event_type in _SUPPRESS_TYPES and recipient:
        try:
            sb.table("email_suppressions").upsert({
                "email": recipient,
                "reason": event_type,
                "source": payload.get("source") or "webhook",
            }, on_conflict="email").execute()
        except Exception:  # noqa: BLE001
            pass


@email_webhooks_router.post("/event")
def email_event(
    payload: Dict[str, Any],
    x_webhook_token: Optional[str] = Header(default=None, alias="X-Webhook-Token"),
):
    _check_auth(x_webhook_token)
    _record_event(payload)
    return {"ok": True}


@email_webhooks_router.post("/batch")
def email_event_batch(
    payload: Dict[str, Any],
    x_webhook_token: Optional[str] = Header(default=None, alias="X-Webhook-Token"),
):
    _check_auth(x_webhook_token)
    events: List[Dict[str, Any]] = payload.get("events") or []
    for ev in events:
        _record_event(ev)
    return {"ok": True, "count": len(events)}
