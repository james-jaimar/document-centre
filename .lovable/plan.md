
# Email dispatch → pdf-server (Celery) — full rebuild

Goal: move all outbound email delivery off Supabase Edge Functions and onto the existing pdf-server (Celery + Redis + FastAPI) on the VPS. Build it properly so it scales to 500+ stores. Edge Functions keep enqueuing into `email_outbox`; only the sender changes.

## Architecture

```text
 App / Edge Functions ──► public.email_outbox  (unchanged contract)
                                  │
                                  ▼
              ┌──────────────────────────────────┐
              │ pdf-server (VPS)                 │
              │                                  │
              │  Celery Beat ──► scan_outbox     │  (every 5–10s)
              │        │           claims N rows │
              │        ▼                         │
              │  Celery queue: emails            │
              │   ├─ worker pool: emails-default │
              │   └─ worker pool: emails-bulk    │
              │        │                         │
              │        ▼                         │
              │  send_email task (aiosmtplib)    │
              │   ├─ resolves email_accounts     │
              │   ├─ decrypts password (vault)   │
              │   ├─ per-account semaphore       │
              │   ├─ loads S3 attachments        │
              │   ├─ SMTP send                   │
              │   └─ writes status + message_id  │
              │                                  │
              │  FastAPI /webhooks/email/...     │
              │   bounce / complaint / delivery  │
              │                                  │
              │  /metrics  (Prometheus)          │
              └──────────────────────────────────┘
```

Edge Function `email-dispatcher` is retired (cron unscheduled, code deleted). All other email Edge Functions (`send-email`, `send-order-email`, `send-quote-email`, etc.) remain unchanged — they only enqueue.

## Phase 1 — DB prep (small, additive)

In `public.email_outbox`:
- Add `claimed_by text` (worker hostname) and `claimed_at timestamptz`.
- Add `worker_lease_until timestamptz` for stuck-claim recovery.
- Add partial index `(status, scheduled_for) WHERE status IN ('queued','retry')`.
- Add `provider_message_id text`, `provider text` (smtp/graph), `last_error_code text`.

New table `email_send_metrics` (rolled-up per minute, optional but useful):
- `bucket_at`, `tenant_id`, `email_account_id`, `sent_count`, `failed_count`, `avg_latency_ms`.

New table `email_events` (append-only, fed by webhooks):
- `id`, `provider_message_id`, `event_type` (delivered/bounce/complaint/open/click), `recipient`, `raw jsonb`, `received_at`.

RPC `claim_email_batch(worker_id, batch_size, lease_seconds)` — `SECURITY DEFINER`, `FOR UPDATE SKIP LOCKED`, sets `claimed_by/claimed_at/worker_lease_until`, returns rows. Replaces the per-row claim logic in the current dispatcher and avoids races between multiple workers.

RPC `release_stuck_claims()` — resets rows where `worker_lease_until < now()` back to `queued`.

## Phase 2 — pdf-server email module

New package `pdf-server/app/email/`:
- `config.py` — env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_VAULT_KEY`, `EMAIL_DEFAULT_FROM`, `EMAIL_BULK_RATE_LIMIT`, etc.
- `credentials.py` — fetch `email_accounts` + decrypt SMTP password using the same scheme as the current edge function (mirror of `decryptVaultSecret`). Cache in-process for 5 min.
- `attachments.py` — fetch from Supabase Storage (S3) via boto3 (already a dep), 20 MB total cap, mirrors current dispatcher.
- `smtp_client.py` — `aiosmtplib` async sender supporting plain/STARTTLS/TLS, oauth-graph fallback (kept for parity).
- `repo.py` — SQLAlchemy queries: `claim_batch`, `mark_sent`, `mark_failed`, `mark_dlq`, idempotent updates.
- `metrics.py` — Prometheus counters/histograms: `email_sent_total`, `email_failed_total{reason}`, `email_send_seconds`, `email_queue_depth`.

New Celery file `pdf-server/app/tasks/email_tasks.py`:
- `@celery_app.task(name="email.scan_outbox")` — beat-driven, calls `claim_email_batch`, fan-outs `email.send` per row.
- `@celery_app.task(name="email.send", bind=True, autoretry_for=(TransientSmtpError,), retry_backoff=True, retry_backoff_max=21600, max_retries=5)` — sends one email. Backoff matches current 1m/5m/15m/1h/6h ladder.
- `@celery_app.task(name="email.release_stuck")` — every 5 min calls `release_stuck_claims()`.

Wire into `app/worker.py`:
- Add `"app.tasks.email_tasks"` to `include`.
- Add three queues: `emails-default`, `emails-bulk`, `emails-control` with routing rules.
- Add beat schedule entries: `email.scan_outbox` every 5s, `email.release_stuck` every 5m.

Per-account concurrency:
- In-process asyncio.Semaphore keyed by `email_account_id`, default cap from `email_accounts.send_delay_ms` and a new `max_concurrency int default 4` column on `email_accounts`.
- Across workers: a Redis `SETNX` lock counter (`email:acct:{id}:inflight`) enforces a global per-account cap, preventing one tenant from monopolizing connections.

Docker / deploy:
- New systemd/docker-compose service `emails-worker` running `celery -A app.worker worker -Q emails-default,emails-bulk -c 8`.
- Existing beat service picks up the new schedule automatically.
- Existing FastAPI service gains `/webhooks/email/bounce`, `/webhooks/email/complaint`, `/webhooks/email/delivery` routes that write to `email_events` and (for hard bounces) suppress the address.

## Phase 3 — Webhooks & suppression

- New table `email_suppressions(email, reason, source, created_at)` — checked in `send_email` task before dispatch; if present, mark row `suppressed` (terminal, no retry).
- Webhook routes verify provider signature (Mailgun-style HMAC for tenants on Mailgun; for plain SMTP we just consume bounce DSN parsing from incoming mail later — out of scope here).
- All webhook writes go through SQLAlchemy with idempotency on `provider_message_id + event_type`.

## Phase 4 — Cutover

1. Deploy DB migration (Phase 1) — backward compatible; old dispatcher keeps working.
2. Deploy pdf-server with email module + Celery worker disabled (no beat schedule yet).
3. Smoke-test: enqueue 5 test emails, manually call `email.scan_outbox` once, verify rows transition.
4. Enable beat schedule on pdf-server.
5. In the **same** deploy, unschedule the Supabase pg_cron job that invokes `email-dispatcher` (single source of truth — no double-sending window).
6. Monitor `email_send_metrics` + Prometheus for 24h.
7. Delete `supabase/functions/email-dispatcher/`.

## Phase 5 — Observability

- Grafana panel on existing pdf-server Prometheus: queue depth, send rate, p95 latency, failure rate by tenant/account.
- Platform admin page (later, not in this plan) can read `email_send_metrics` + `email_events` to show per-tenant deliverability.

## Throughput target

- Default config: 2 worker processes × 8 concurrency = 16 parallel sends, beat every 5s, batch 100 → ~12,000 emails/min ceiling, gated by per-account caps (typically 5–20/sec per SMTP account).
- 500 stores × 50 emails/day = 25,000/day → well under 1 minute of full-throttle capacity. Burstable.

## Technical notes

- Reuse `boto3` (already in requirements) for Supabase Storage attachment downloads via S3 endpoint.
- Vault decryption must mirror the edge-function logic byte-for-byte — port to Python in `credentials.py` and unit-test against a known ciphertext.
- `task_acks_late=True` + `task_reject_on_worker_lost=True` are already set globally — good for at-least-once delivery; the DB `claimed_at`/`worker_lease_until` + `release_stuck_claims` handles crashed workers.
- Idempotency: `email_outbox.id` is the natural key; `mark_sent` is a conditional UPDATE (`WHERE status IN ('queued','retry','sending')`) so a duplicate send attempt after crash is a no-op once the first one wins.
- No changes to enqueue Edge Functions or frontend. Contract on `email_outbox` is preserved.

## Out of scope (call out)

- Marketing/bulk email UI, list management, unsubscribe pages — separate effort.
- Replacing per-tenant SMTP with a managed provider (Mailgun/Postmark) — possible later optimization; this rebuild keeps current per-tenant SMTP model.
- DMARC/SPF/DKIM tenant onboarding automation.
