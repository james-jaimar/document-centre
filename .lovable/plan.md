The upload is hanging because the new backend instrumentation writes to `job_events`, but the VPS database does not actually have a `job_events` table. The worker starts the `inspect_asset` job, then crashes at the instrumentation insert before it can read page metadata. That leaves the DB job stuck as `running`, the worker idle, and the UI polling forever at “Reading page metadata… 45%”. The ops Jobs page is also blank because it currently reads from `job_events` only.

I will fix this in three parts.

1. Add the missing backend schema
- Update `pdf-server/migrations/2026_04_24_ops_api.sql` so it creates `job_events` idempotently, not only adds columns if it already exists.
- Include the columns used by the ORM:
  - `id`, `job_id`, `asset_id`, `tenant_id`, `app_id`
  - `task_name`, `queue_name`, `worker_name`, `stage`, `status`, `message`
  - `started_at`, `finished_at`, `duration_ms`, `metadata_json`, `created_at`
- Add indexes for job, asset, tenant, stage/status, and timestamps.

2. Make the backend resilient so this cannot hang again
- Harden `job_event_repo` so if the telemetry table is missing or temporarily broken, task processing continues instead of killing the PDF job.
- Add safe fallbacks in `/v1/assets/{asset_id}/events` and `/v1/ops/assets/{asset_id}/pipeline` so missing telemetry returns an empty event list rather than 500.
- Update `/v1/ops/jobs` to fall back to the core `jobs` table when `job_events` is unavailable or empty, so the ops UI still shows queued/running/failed/completed jobs.
- Fix status filter mapping: the UI uses `queued/started/completed/failed/retry`, but job events use `running/done/failed`; I’ll normalize that so filters work.

3. Recover the currently stuck upload/job after deployment
- Run the migration on the VPS database.
- Restart `document-centre-api` and `document-centre-worker`.
- Reset the currently stuck job/asset so the user can retry cleanly:
  - current stuck job: `0e189c86-3190-4427-8c57-371174de761d`
  - current stuck asset: `90709b93-416c-4eca-827a-82ffc34b87c9`
- Because the original Celery task already crashed and is gone, the cleanest recovery is either mark that job failed/cancelled and re-upload, or enqueue a fresh inspect for the asset after the migration. I’ll include exact safe VPS commands for both, and prefer re-enqueueing if the source object is still present.

Technical notes
- The earlier queue fix was still necessary; the worker is subscribed and did pick up `inspect_asset` once. The new failure is different: the task dies immediately when trying to insert the first `job_events` row.
- This also explains why `/v1/ops/workers` shows idle with `total.inspect_asset: 1`, while `/v1/jobs/{id}` remains `running` and `/v1/ops/jobs` is empty.
- I will not reintroduce the page-1 fast-path in the customer UI. The upload modal can remain modal-only; the backend can render normally and the UI progress will be handled separately after the hard backend fix.