"""Postgres LISTEN/NOTIFY bridge for the email outbox.

Holds a long-lived connection to the Supabase database, LISTENs on the
`email_enqueued` channel (fired by the `notify_email_dispatcher` trigger
on email_outbox AFTER INSERT), and dispatches `email.scan_outbox` to
Celery the moment a notification arrives.

Run as its own systemd unit: document-centre-listener-emails.service.
Beat remains as a safety net for missed notifies and scheduled rows.

Resilience:
  - Reconnects with exponential backoff (max 60s) on any connection loss.
  - Coalesces a burst of NOTIFYs into a single scan_outbox dispatch
    (debounce of 200ms) — scan_outbox claims a batch atomically so
    duplicate triggers are harmless but wasteful.
  - On stale connection (no events for `idle_ping_seconds`), issues a
    cheap SELECT 1 to detect dead sockets early.
"""
from __future__ import annotations

import logging
import os
import select
import signal
import sys
import threading
import time
from typing import Optional

import psycopg

from app.core.config import settings

log = logging.getLogger("email.listener")

CHANNEL = "email_enqueued"
DEBOUNCE_SECONDS = 0.2
IDLE_PING_SECONDS = 60
RECONNECT_MIN = 1
RECONNECT_MAX = 60


def _resolve_dsn() -> str:
    """Prefer LISTEN_DATABASE_URL (direct connection — pgbouncer transaction
    mode does NOT support LISTEN/NOTIFY). Fall back to DATABASE_URL."""
    dsn = os.getenv("LISTEN_DATABASE_URL") or settings.database_url
    if not dsn:
        raise RuntimeError("LISTEN_DATABASE_URL / DATABASE_URL not set")
    # psycopg expects postgresql:// or postgres:// — normalize.
    if dsn.startswith("postgres+psycopg://"):
        dsn = dsn.replace("postgres+psycopg://", "postgresql://", 1)
    if dsn.startswith("postgresql+psycopg://"):
        dsn = dsn.replace("postgresql+psycopg://", "postgresql://", 1)
    return dsn


_shutdown = threading.Event()


def _handle_signal(signum, _frame):
    log.info("listener received signal=%s, shutting down", signum)
    _shutdown.set()


def _dispatch_scan() -> None:
    """Enqueue a scan_outbox task via the queue abstraction (Celery or Cloud Tasks)."""
    from app.core.queue import enqueue
    try:
        enqueue("scan_outbox", queue="emails-control")
    except Exception:  # noqa: BLE001
        log.exception("failed to dispatch scan_outbox")


def _listen_loop(conn: psycopg.Connection) -> None:
    """Block on the connection's notify stream until shutdown or error."""
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f"LISTEN {CHANNEL};")
    log.info("listening on channel=%s", CHANNEL)

    pending = False
    pending_since: Optional[float] = None
    last_event = time.monotonic()

    while not _shutdown.is_set():
        # Wait up to 1s for data on the socket OR for a pending debounce window.
        timeout = 1.0
        if pending and pending_since is not None:
            timeout = max(0.0, DEBOUNCE_SECONDS - (time.monotonic() - pending_since))

        r, _, _ = select.select([conn], [], [], timeout)
        if r:
            # Drain ALL notifies that have arrived.
            for n in conn.notifies(timeout=0):
                last_event = time.monotonic()
                if not pending:
                    pending = True
                    pending_since = time.monotonic()
                log.debug("notify pid=%s channel=%s payload=%s", n.pid, n.channel, n.payload)

        # Fire after debounce window elapses.
        if pending and pending_since is not None and (time.monotonic() - pending_since) >= DEBOUNCE_SECONDS:
            _dispatch_scan()
            pending = False
            pending_since = None

        # Idle keep-alive: detect a dead socket before NOTIFYs silently disappear.
        if (time.monotonic() - last_event) > IDLE_PING_SECONDS:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            last_event = time.monotonic()


def main() -> int:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    dsn = _resolve_dsn()
    backoff = RECONNECT_MIN

    while not _shutdown.is_set():
        try:
            log.info("connecting to postgres for LISTEN")
            with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as conn:
                backoff = RECONNECT_MIN  # reset on successful connect
                # Kick a scan on startup in case rows were enqueued while we were down.
                _dispatch_scan()
                _listen_loop(conn)
        except Exception:  # noqa: BLE001
            if _shutdown.is_set():
                break
            log.exception("listener crashed; reconnecting in %ss", backoff)
            for _ in range(backoff * 10):
                if _shutdown.is_set():
                    break
                time.sleep(0.1)
            backoff = min(RECONNECT_MAX, backoff * 2)

    log.info("listener exited cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
