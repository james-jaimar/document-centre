# Fix: "Could not generate job ticket" (502 from production-pdf)

## What's actually wrong

You're right that it worked a week ago — it broke on **Fri 28 Aug 16:45 UTC**, in the commit that split job-ticket rendering onto its own queue. It's not tenant- or permission-related; it fails for every job since then.

Verified:
- Commit `977bffc0b` (28 Aug 16:45) changed `pdf-server/app/web/routes.py` to enqueue the ticket task on a new logical queue `"tickets"`, and touched only `routes.py` + `production_tasks.py` — it never registered `"tickets"` in `pdf-server/app/core/queue.py`.
- In Cloud Tasks mode (production is `queue_backend: cloud_tasks`) `QUEUE_TO_CLOUD_TASKS_QUEUE["tickets"]` raises a KeyError, the PDF API returns 500, and the edge function relays it as 502.
- The Supabase edge log confirms the single failure today: `POST | 502 | .../functions/v1/production-pdf`.
- The PDF API itself is healthy (`/health` ok).
- Only the Celery path knows the queue (`start-worker-light.sh -Q default,thumbnails,tickets`), which is why nothing caught it — production doesn't use Celery.
- Data matches the timeline: INV-00136's ticket rendered at 14:39 on 28 Aug (before the commit); INV-00137, 138 and 139 all have `job_ticket_pdf_path = null`.

Print-ready assembly is unaffected because it still uses `documents`, which is mapped.


## The fix

1. Register the `tickets` logical queue in `pdf-server/app/core/queue.py`:
   - `QUEUE_TO_WORKER_ENV["tickets"] = "WORKER_URL_LIGHT"`
   - `QUEUE_TO_CLOUD_TASKS_QUEUE["tickets"] = "documents-light"`
   This keeps the original intent (tickets never queue behind heavy assembly on `documents-heavy`) without needing a new Cloud Tasks queue or extra infrastructure.
2. Wire `pdf-server/scripts/audit-enqueue-coverage.py` (which already checks exactly this) into CI / the deploy path, so an unmapped queue fails at build time instead of at the customer's click.
3. Improve the error surfaced to the admin: `production-pdf` already returns the upstream text, but `ProductionPanel` shows the generic Supabase message. Show the real reason in the toast so the next upstream failure is self-diagnosing.

## Notes

- The pdf-api service must be redeployed for step 1 to take effect (code change only, no env or GCP queue change).
- If you'd prefer a genuinely dedicated Cloud Tasks queue (`tickets-light`), that needs a `gcloud tasks queues create` in `gcp-tasks-bootstrap.sh` as well — say the word and I'll include it.
