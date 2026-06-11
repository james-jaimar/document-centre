# Fix: email worker crashes because Redis isn't available on Cloud Run

## Root cause (confirmed from logs)

Every `send_email` call on Cloud Run blows up here:

```
File "/app/app/email/concurrency.py", line 21, in _client
    _redis = redis.Redis.from_url(settings.redis_url, ...)
ValueError: Redis URL must specify one of the following schemes (redis://, rediss://, unix://)
```

`account_slot()` unconditionally opens a Redis client to enforce per-account send concurrency. On the VPS, Redis was the Celery broker so this worked. On Cloud Run the queue backend is Cloud Tasks — there is no Redis, and `REDIS_URL` is unset (or set to something invalid like an empty string / `none`), so the URL parse fails and the task 500s. Cloud Tasks retries forever, the outbox row stays `claimed`, `queued_at` never clears → emails never go out.

Cloud Tasks already enforces a global send rate via the `emails-default` queue (`max_concurrent_dispatches`), so the per-account Redis limiter is a "nice to have" on Cloud Run, not load-bearing.

## Fix

Make the limiter degrade gracefully when Redis is unavailable, so the send path proceeds unguarded by Redis (Cloud Tasks queue concurrency takes over). The VPS path is gone, so we don't need to preserve Redis-backed limiting in production — but we keep it working when a valid `REDIS_URL` IS configured (local dev, future use).

### Code change — `pdf-server/app/email/concurrency.py`

1. In `_client()`, wrap the URL parse / connection in try/except. If `settings.redis_url` is missing, empty, doesn't start with `redis://`/`rediss://`/`unix://`, OR if the first ping fails, return `None` and cache that decision (a `_disabled = True` flag) so we don't retry on every send.
2. In `account_slot()`, if `_client()` returns `None`, log once at INFO ("per-account Redis limiter disabled — relying on Cloud Tasks queue concurrency") and `yield` immediately without any INCR/DECR/TTL bookkeeping.
3. Keep the existing Redis-backed path unchanged when Redis IS reachable.

No other files change. No env var changes required. No deploy script changes — the next Cloud Run image rebuild picks it up.

## Verification

After deploy:

1. `gcloud logging read 'resource.labels.service_name="pdf-worker-emails" AND severity>=WARNING' --limit=20` — the `ValueError: Redis URL must specify ...` traceback should be gone.
2. `select id, status, queued_at, sent_at, last_error from email_outbox order by created_at desc limit 20` — the 12 stuck rows transition to `sent` (or to `failed` with a real SMTP/Graph error if a specific message has a bad recipient / attachment / mailbox).
3. The `emails-default` Cloud Tasks queue drains (no growing retry backlog).

If any rows then fail with a NEW error code (e.g. `graph_oauth_permanent`, `attachment_error`), that's a separate, real per-message problem to address — but the pipeline itself will be unblocked.

## Out of scope

- No change to Cloud Tasks queue config, IAM, OIDC, or secrets — logs confirm those are fine.
- No change to `email_tasks.py`, `tasks_routes.py`, or the Celery shim — the bound-task `self` is already handled correctly by the runner.
- No reintroduction of Redis on GCP. If you later want true per-mailbox throttling on Cloud Run, the right move is Memorystore (Redis) + `REDIS_URL=redis://10.x.x.x:6379/0` on the worker — but that's a separate decision, not needed to unblock sends.
