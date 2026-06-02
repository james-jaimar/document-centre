"""SMTP sender built on aiosmtplib.

Synchronous wrapper exposed for Celery tasks (which are sync). We run the
async send via `asyncio.run` per task — Celery prefork workers don't share
event loops so this is safe and simple.
"""
from __future__ import annotations

import asyncio
import email.utils as eut
from email.message import EmailMessage
from typing import Iterable, List, Optional

import aiosmtplib  # type: ignore

from .attachments import LoadedAttachment
from .config import email_settings
from .credentials import SmtpCreds


class TransientSmtpError(Exception):
    """Network / 4xx / connection failures — Celery will retry."""


class PermanentSmtpError(Exception):
    """5xx invalid recipient / auth failures — do not retry."""


def _build_message(
    creds: SmtpCreds,
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
    attachments: Iterable[LoadedAttachment],
    message_id: str,
) -> EmailMessage:
    msg = EmailMessage()
    eff_from_email = from_email or creds.from_email
    eff_from_name = from_name or creds.from_name
    msg["From"] = eut.formataddr((eff_from_name, eff_from_email)) if eff_from_name else eff_from_email
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Message-ID"] = message_id
    rt = reply_to or creds.reply_to
    if rt:
        msg["Reply-To"] = rt

    if text and html:
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")
    elif html:
        msg.set_content("This message requires an HTML-capable client.")
        msg.add_alternative(html, subtype="html")
    else:
        msg.set_content(text or "")

    for att in attachments:
        maintype, _, subtype = att.content_type.partition("/")
        msg.add_attachment(
            att.data,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=att.filename,
            cid=att.content_id,
            disposition="inline" if att.inline else "attachment",
        )
    return msg


async def _send_async(
    creds: SmtpCreds,
    msg: EmailMessage,
    *,
    recipients: List[str],
) -> None:
    use_tls = creds.secure == "tls"
    start_tls = creds.secure == "starttls"
    try:
        async with aiosmtplib.SMTP(
            hostname=creds.host,
            port=creds.port,
            use_tls=use_tls,
            start_tls=False,  # do STARTTLS manually after connect
            timeout=email_settings.smtp_connect_timeout,
        ) as client:
            if start_tls:
                await client.starttls()
            await client.login(creds.username, creds.password)
            await client.send_message(msg, recipients=recipients)
    except aiosmtplib.SMTPResponseException as exc:
        # 4xx transient, 5xx permanent
        if 400 <= exc.code < 500:
            raise TransientSmtpError(f"{exc.code} {exc.message}") from exc
        raise PermanentSmtpError(f"{exc.code} {exc.message}") from exc
    except (aiosmtplib.SMTPConnectError, aiosmtplib.SMTPTimeoutError, OSError) as exc:
        raise TransientSmtpError(str(exc)) from exc


def send_smtp(
    creds: SmtpCreds,
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
    attachments: Optional[List[LoadedAttachment]] = None,
    message_id: str,
) -> None:
    """Blocking SMTP send. Raises TransientSmtpError or PermanentSmtpError."""
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
        attachments=attachments or [],
        message_id=message_id,
    )
    recipients = [to] + (cc or []) + (bcc or [])
    asyncio.run(
        asyncio.wait_for(
            _send_async(creds, msg, recipients=recipients),
            timeout=email_settings.smtp_total_timeout,
        )
    )
