"""Shared exception types for the email transport layer.

Defined here (rather than in smtp_client.py) so graph_client.py and
gmail_client.py can raise them without creating an import cycle
through credentials.py → gmail_client → smtp_client → credentials.
"""
from __future__ import annotations


class TransientSmtpError(Exception):
    """Network / 4xx / connection failures — Celery will retry."""


class PermanentSmtpError(Exception):
    """5xx invalid recipient / auth failures — do not retry."""
