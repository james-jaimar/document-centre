"""Prometheus metrics for the email pipeline.

Importing prometheus_client is optional — if it's not installed (the
service has it via uvicorn[standard] but worker may not), we fall back to
no-op stubs so imports don't fail.
"""
from __future__ import annotations

try:
    from prometheus_client import Counter, Histogram  # type: ignore

    email_sent_total = Counter(
        "email_sent_total", "Emails successfully delivered", ["provider"]
    )
    email_failed_total = Counter(
        "email_failed_total", "Email send failures", ["reason"]
    )
    email_send_seconds = Histogram(
        "email_send_seconds", "End-to-end send latency (s)",
        buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
    )
except Exception:  # noqa: BLE001
    class _Noop:
        def labels(self, *_, **__): return self
        def inc(self, *_): pass
        def observe(self, *_): pass

    email_sent_total = _Noop()
    email_failed_total = _Noop()
    email_send_seconds = _Noop()
