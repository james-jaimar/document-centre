"""Runtime tunables for the email subsystem.

Reads from environment so ops can tune throughput without redeploys.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class EmailSettings:
    batch_size: int
    lease_seconds: int
    max_attachment_bytes: int
    default_account_concurrency: int
    smtp_connect_timeout: int
    smtp_total_timeout: int
    scan_interval_seconds: int

    @classmethod
    def from_env(cls) -> "EmailSettings":
        return cls(
            batch_size=int(os.getenv("EMAIL_BATCH_SIZE", "50")),
            lease_seconds=int(os.getenv("EMAIL_LEASE_SECONDS", "120")),
            max_attachment_bytes=int(os.getenv("EMAIL_MAX_ATTACHMENT_BYTES", str(20 * 1024 * 1024))),
            default_account_concurrency=int(os.getenv("EMAIL_DEFAULT_ACCOUNT_CONCURRENCY", "4")),
            smtp_connect_timeout=int(os.getenv("EMAIL_SMTP_CONNECT_TIMEOUT", "15")),
            smtp_total_timeout=int(os.getenv("EMAIL_SMTP_TOTAL_TIMEOUT", "60")),
            scan_interval_seconds=int(os.getenv("EMAIL_SCAN_INTERVAL_SECONDS", "5")),
        )


email_settings = EmailSettings.from_env()
