"""Cross-worker per-account concurrency limiter.

Backed by Redis INCR with a TTL safety net so a crashed worker doesn't
permanently consume a slot.

On Cloud Run there is no Redis (the broker is Cloud Tasks), so this limiter
degrades to a no-op when REDIS_URL is missing/invalid or the server is
unreachable. In that mode the Cloud Tasks `emails-default` queue's
`max_concurrent_dispatches` provides the global send-rate ceiling.
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager

import redis

from app.core.config import settings

log = logging.getLogger("email.concurrency")

_redis: "redis.Redis | None" = None
_disabled: bool = False
_logged_disabled: bool = False


def _valid_redis_url(url: str | None) -> bool:
    if not url:
        return False
    return url.startswith(("redis://", "rediss://", "unix://"))


def _client() -> "redis.Redis | None":
    """Return a live Redis client, or None if Redis is unavailable.

    The disabled decision is cached so we don't reparse / reconnect on every
    send. To re-enable, restart the process.
    """
    global _redis, _disabled, _logged_disabled
    if _disabled:
        return None
    if _redis is not None:
        return _redis

    url = getattr(settings, "redis_url", None)
    if not _valid_redis_url(url):
        _disabled = True
        if not _logged_disabled:
            log.info(
                "per-account Redis limiter disabled — REDIS_URL not set or invalid; "
                "relying on Cloud Tasks queue concurrency"
            )
            _logged_disabled = True
        return None

    try:
        client = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
    except Exception as exc:  # noqa: BLE001
        _disabled = True
        if not _logged_disabled:
            log.warning(
                "per-account Redis limiter disabled — connect failed (%s); "
                "relying on Cloud Tasks queue concurrency",
                exc,
            )
            _logged_disabled = True
        return None

    _redis = client
    return _redis


@contextmanager
def account_slot(account_id: str, max_concurrency: int, *, lease_seconds: int = 120, wait_seconds: int = 30):
    """Block until a per-account send slot is free, then release on exit.

    No-op when Redis is unavailable (see module docstring).
    """
    r = _client()
    if r is None:
        yield
        return

    key = f"email:acct:{account_id}:inflight"
    deadline = time.monotonic() + wait_seconds
    acquired = False
    try:
        while True:
            # Reset stale counter that has no TTL (shouldn't happen but defensive)
            if r.ttl(key) < 0:
                r.expire(key, lease_seconds)
            n = r.incr(key)
            if n == 1:
                r.expire(key, lease_seconds)
            if n <= max_concurrency:
                acquired = True
                break
            # over cap — give it back and wait
            r.decr(key)
            if time.monotonic() >= deadline:
                raise TimeoutError(f"per-account slot wait exceeded ({account_id})")
            time.sleep(0.25)
        yield
    finally:
        if acquired:
            try:
                r.decr(key)
            except Exception:  # noqa: BLE001
                pass
