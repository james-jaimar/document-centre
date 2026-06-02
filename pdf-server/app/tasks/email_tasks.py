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
from app.email.credentials import CredentialError, get_account_creds
from app.email.metrics import email_failed_total, email_send_seconds, email_sent_total
from app.email.smtp_client import PermanentSmtpError, TransientSmtpError, send_smtp
from app.worker import celery_app

log = logging.getLogger("email.tasks")


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
        send_email.apply_async(args=[row], queue="emails-default")
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
        repo.mark_failed(sb, outbox_id, error="no_email_account", error_code="config_missing")
        email_failed_total.labels(reason="config_missing").inc()
        return "config_missing"

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
    try:
        with account_slot(account_id, max_concurrency=creds.max_concurrency,
                          lease_seconds=email_settings.lease_seconds):
            send_smtp(
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
            )
    except PermanentSmtpError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        repo.mark_failed(sb, outbox_id, error=str(exc), error_code="smtp_permanent")
        repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                           sent=False, latency_ms=latency_ms)
        email_failed_total.labels(reason="smtp_permanent").inc()
        return "smtp_permanent"
    except TransientSmtpError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        # Celery retry — but also record + flip status so DB stays consistent
        # if we hit max_retries.
        attempts = int(row.get("attempts") or 0)
        max_attempts = int(row.get("max_attempts") or 5)
        if self.request.retries + 1 >= max_attempts:
            repo.mark_failed(sb, outbox_id, error=str(exc), error_code="smtp_transient_exhausted", dlq=True)
            email_failed_total.labels(reason="smtp_transient_dlq").inc()
            return "dlq"
        repo.mark_retry(sb, outbox_id, attempts=attempts, error=str(exc), error_code="smtp_transient")
        repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                           sent=False, latency_ms=latency_ms)
        email_failed_total.labels(reason="smtp_transient").inc()
        raise  # autoretry_for picks this up

    latency_ms = int((time.monotonic() - started) * 1000)
    repo.mark_sent(sb, outbox_id, provider="smtp", message_id=message_id)
    repo.record_metric(sb, tenant_id=row.get("tenant_id"), email_account_id=account_id,
                       sent=True, latency_ms=latency_ms)
    email_sent_total.labels(provider="smtp").inc()
    email_send_seconds.observe(latency_ms / 1000.0)
    return "sent"
