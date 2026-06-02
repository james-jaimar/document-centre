"""Cross-worker per-account concurrency limiter.

Backed by Redis INCR with a TTL safety net so a crashed worker doesn't
permanently consume a slot.
"""
from __future__ import annotations

import time
from contextlib import contextmanager

import redis

from app.core.config import settings

_redis: "redis.Redis | None" = None


def _client() -> "redis.Redis":
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


@contextmanager
def account_slot(account_id: str, max_concurrency: int, *, lease_seconds: int = 120, wait_seconds: int = 30):
    """Block until a per-account send slot is free, then release on exit."""
    r = _client()
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
