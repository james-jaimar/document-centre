# Fix: "Could not generate job ticket" (502 from production-pdf)

## What's actually wrong

This is not a tenant/permission problem — it fails for any job.

Verified:
- The Supabase edge log shows one failure: `POST | 502 | .../functions/v1/production-pdf` at 08:04 today. A 502 from that function means the upstream PDF API rejected the dispatch.
- The PDF API itself is healthy (`/health` returns ok, `queue_backend: cloud_tasks`).
- `pdf-server/app/web/routes.py` enqueues the ticket task on the logical queue `"tickets"` (added when ticket rendering was split off the assembly queue).
- `pdf-server/app/core/queue.py` has no `"tickets"` entry in either `QUEUE_TO_CLOUD_TASKS_QUEUE` or `QUEUE_TO_WORKER_ENV`. In Cloud Tasks mode the lookup raises, the API returns 500, and the edge function turns that into 502.
- The Celery-only path (`start-worker-light.sh -Q default,thumbnails,tickets`) does know the queue, which is why this was never caught on the legacy VPS setup.

Print-ready assembly still works because it uses `documents`, which is mapped.

## The fix

1. Register the `tickets` logical queue in `pdf-server/app/core/queue.py`:
   - `QUEUE_TO_WORKER_ENV["tickets"] = "WORKER_URL_LIGHT"`
   - `QUEUE_TO_CLOUD_TASKS_QUEUE["tickets"] = "documents-light"`
   This keeps the original intent (tickets never queue behind heavy assembly on `documents-heavy`) without needing a new Cloud Tasks queue or extra infrastructure.
2. Add a startup guard: assert every logical queue named by `enqueue()` call sites exists in both maps, so an unmapped queue fails loudly at deploy rather than at the customer's click.
3. Improve the error surfaced to the admin: `production-pdf` already returns the upstream text, but `ProductionPanel` shows the generic Supabase message. Show the real reason in the toast so the next upstream failure is self-diagnosing.

## Notes

- The pdf-api service must be redeployed for step 1 to take effect (code change only, no env or GCP queue change).
- If you'd prefer a genuinely dedicated Cloud Tasks queue (`tickets-light`), that needs a `gcloud tasks queues create` in `gcp-tasks-bootstrap.sh` as well — say the word and I'll include it.
