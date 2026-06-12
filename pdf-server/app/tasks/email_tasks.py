"""Celery tasks for the email pipeline.

- `email.scan_outbox` (beat-driven): claims a batch from email_outbox and
  fan-outs an `email.send` task per row.
- `email.send`: sends one outbox row via SMTP, marks status, records metric.
- `email.release_stuck`: resets rows whose worker lease expired.

The send task is intentionally narrow — credential resolution, attachment
loading, and SMTP send are delegated to the `app.email` package so this
file stays a thin Celery shim.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict

from app.email import repo
from app.email.attachments import AttachmentError, load_attachments
from app.email.concurrency import account_slot
from app.email.config import email_settings
from app.email.credentials import CredentialError, get_account_creds, invalidate
from app.email.metrics import email_failed_total, email_send_seconds, email_sent_total
from app.email.errors import PermanentSmtpError, TransientSmtpError
from app.email.smtp_client import send_smtp
from app.email.graph_client import send_graph
from app.email.gmail_client import send_gmail
from app.email.graph_oauth_client import send_graph_oauth
from app.worker import celery_app
from app.core.queue import enqueue

log = logging.getLogger("email.tasks")


def _persist_rotated_refresh_token(sb, account_id: str, refresh_token: str) -> None:
    """Replace the stored OAuth refresh token after Microsoft rotates it.

    Microsoft may return a new refresh_token during refresh. The old token must
    be discarded, otherwise the next worker process can fail after cache expiry.
    """
    acct = (
        sb.table("email_accounts")
        .select("id, transport, oauth_refresh_token_secret_id")
        .eq("id", account_id)
        .single()
        .execute()
        .data
    )
    if not acct or acct.get("transport") != "graph_oauth":
        return
    secret_name = f"graph_oauth:rotation:{account_id}:{uuid.uuid4()}"
    created = sb.rpc(
        "create_email_account_secret",
        {"p_name": secret_name, "p_secret": refresh_token},
    ).execute().data
    if not created:
        raise RuntimeError("Vault did not return a rotated refresh token secret id")
    old_secret = acct.get("oauth_refresh_token_secret_id")
    sb.table("email_accounts").update({
        "oauth_refresh_token_secret_id": created,
        "last_error": None,
    }).eq("id", account_id).execute()
    if old_secret:
        try:
            sb.rpc("delete_email_account_secret", {"p_secret_id": old_secret}).execute()
        except Exception as exc:  # noqa: BLE001
            log.warning("failed to delete old rotated OAuth secret for account=%s: %s", account_id, exc)
    invalidate(account_id)


@celery_app.task(name="email.scan_outbox", queue="emails-control", ignore_result=True)
def scan_outbox() -> int:
    """Claim a batch and fan-out send tasks. Returns the number dispatched."""
    sb = repo.get_supabase()
    rows = repo.claim_batch(
        sb,
        worker_id=repo.worker_id(),
        batch_size=email_settings.batch_size,
        lease_seconds=email_settings.lease_seconds,
    )
    if not rows:
        return 0
    for row in rows:
        enqueue("send_email", row, queue="emails-default")
    log.info("scan_outbox dispatched=%d", len(rows))
    return len(rows)


@celery_app.task(name="email.release_stuck", queue="emails-control", ignore_result=True)
def release_stuck() -> int:
    sb = repo.get_supabase()
    n = repo.release_stuck(sb)
    if n:
        log.warning("release_stuck reset=%d rows", n)
    return n


@celery_app.task(
    name="email.send",
    queue="emails-default",
    bind=True,
    acks_late=True,
    autoretry_for=(TransientSmtpError,),
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=21600,  # 6h
    retry_jitter=True,
)
def send_email(self, row: Dict[str, Any]) -> str:
    """Send one outbox row. Idempotent at the DB level (claim_email_batch)."""
    sb = repo.get_supabase()
    outbox_id = row["id"]
    to_email = (row.get("to_email") or "").strip()
    if not to_email:
        repo.mark_failed(sb, outbox_id, error="empty_recipient", error_code="invalid_recipient")
        email_failed_total.labels(reason="invalid_recipient").inc()
        return "invalid_recipient"

    # Suppression list
    if repo.is_suppressed(sb, to_email):
        repo.mark_failed(sb, outbox_id, error="recipient_suppressed", error_code="suppressed")
        email_failed_total.labels(reason="suppressed").inc()
        return "suppressed"

    account_id = row.get("email_account_id")
    if not account_id:
        # Fallback: resolve from tenant/branch (mirrors edge dispatcher).
        from app.email.credentials import resolve_account_id_for_row
        account_id = resolve_account_id_for_row(
            sb,
            tenant_id=row.get("tenant_id"),
            branch_id=row.get("branch_id"),
        )
        if not account_id:
            repo.mark_failed(sb, outbox_id, error="no_email_account", error_code="config_missing")
            email_failed_total.labels(reason="config_missing").inc()
            return "config_missing"
        # Best-effort: persist resolved account for audit.
        try:
            sb.table("email_outbox").update({"email_account_id": account_id}).eq("id", outbox_id).execute()
        except Exception:  # noqa: BLE001
            pass
        row["email_account_id"] = account_id


    try:
        creds = get_account_creds(sb, account_id)
    except CredentialError as exc:
        repo.mark_failed(sb, outbox_id, error=f"credential_error: {exc}", error_code="config_missing")
        email_failed_total.labels(reason="credential_error").inc()
        return "credential_error"

    try:
        atts = load_attachments(sb, row.get("attachments"))
    except AttachmentError as exc:
        repo.mark_failed(sb, outbox_id, error=str(exc), error_code="attachment_error")
        email_failed_total.labels(reason="attachment_error").inc()
        return "attachment_error"

    message_id = f"<{uuid.uuid4()}@{creds.from_email.split('@')[-1]}>"
    started = time.monotonic()
    provider = creds.kind  # "smtp" | "graph" | "gmail_oauth" | "graph_oauth"
    sender_fn = {
        "smtp": send_smtp,
        "graph": send_graph,
        "gmail_oauth": send_gmail,
        "graph_oauth": send_graph_oauth,
    }[provider]

    try:
        with account_slot(account_id, max_concurrency=creds.max_concurrency,
                          lease_seconds=email_settings.lease_seconds):
            sent_message_id = sender_fn(
                creds,
                to=to_email,
                cc=row.get("cc"),
                bcc=row.get("bcc"),
                reply_to=row.get("reply_to"),
                from_name=row.get("from_name"),
                from_email=row.get("from_email"),
                subject=row.get("subject") or "",
                html=row.get("html"),
                text=row.get("text_body"),
                attachments=atts,
                message_id=message_id,
                **(
                    {"refresh_token_updater": lambda token: _persist_rotated_refresh_token(sb, account_id, token)}
                    if provider == "graph_oauth"
                    else {}
                ),
            )
        # SMTP returns None (we keep our generated message_id); graph/gmail
        # return the provider id (x-ms-request-id / gmail message id).
        if sent_message_id:
            message_id = sent_message_id
    except PermanentSmtpError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        repo.mark_failed(sb, outbox_id, error=str(exc), error_code=f"{provider}_permanent")
        repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                           sent=False, latency_ms=latency_ms)
        email_failed_total.labels(reason=f"{provider}_permanent").inc()
        # Surface auth-style failures on the account row so the UI can prompt
        # the admin to reconnect (esp. Microsoft / Gmail OAuth refresh failures).
        try:
            err_text = str(exc)
            if any(tag in err_text for tag in ("auth", "AADSTS", "invalid_grant", "401", "403")):
                sb.table("email_accounts").update({
                    "last_error": err_text[:500],
                }).eq("id", account_id).execute()
        except Exception:  # noqa: BLE001
            pass
        return f"{provider}_permanent"
    except TransientSmtpError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        attempts = int(row.get("attempts") or 0)
        max_attempts = int(row.get("max_attempts") or 5)
        if self.request.retries + 1 >= max_attempts:
            repo.mark_failed(sb, outbox_id, error=str(exc), error_code=f"{provider}_transient_exhausted", dlq=True)
            email_failed_total.labels(reason=f"{provider}_transient_dlq").inc()
            return "dlq"
        repo.mark_retry(sb, outbox_id, attempts=attempts, error=str(exc), error_code=f"{provider}_transient")
        repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                           sent=False, latency_ms=latency_ms)
        email_failed_total.labels(reason=f"{provider}_transient").inc()
        raise  # autoretry_for picks this up

    latency_ms = int((time.monotonic() - started) * 1000)
    repo.mark_sent(sb, outbox_id, provider=provider, message_id=message_id)
    repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                       sent=True, latency_ms=latency_ms)
    email_sent_total.labels(provider=provider).inc()
    email_send_seconds.observe(latency_ms / 1000.0)
    return "sent"
