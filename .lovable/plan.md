## Goal

Make `.github/workflows/pdf-server-deploy.yml` set every env var `pdf-api` needs to flip `QUEUE_BACKEND=cloud_tasks`, so no manual `gcloud run services update` is ever required after a deploy. `WORKER_SELF_URL` (workers) and `BEAT_SELF_URL` (api) are already wired — only the Cloud Tasks enqueue side is missing.

## What's missing today

`pdf-api` needs these at runtime when `enqueue()` is in `cloud_tasks` mode (see `pdf-server/app/core/queue.py`):

- `TASKS_INVOKER_SA` — the `cloud-tasks-invoker@…` SA created by `gcp-tasks-bootstrap.sh`
- `WORKER_URL_HEAVY` / `WORKER_URL_LIGHT` / `WORKER_URL_EMAILS` — push targets per logical queue

Today they have to be set by hand after each deploy because the worker URLs aren't known until the worker deploy step finishes.

## Change

Add a new step after **"Deploy HTTP workers"** and before **"Set BEAT_SELF_URL on pdf-api"** that consolidates both pdf-api second-pass updates into one call:

```yaml
- name: Wire Cloud Tasks env vars on pdf-api
  run: |
    api_url=$(gcloud run services describe pdf-api          --region="${{ env.GCP_REGION }}" --format='value(status.url)')
    heavy_url=$(gcloud run services describe pdf-worker-heavy  --region="${{ env.GCP_REGION }}" --format='value(status.url)')
    light_url=$(gcloud run services describe pdf-worker-light  --region="${{ env.GCP_REGION }}" --format='value(status.url)')
    emails_url=$(gcloud run services describe pdf-worker-emails --region="${{ env.GCP_REGION }}" --format='value(status.url)')
    invoker_sa="cloud-tasks-invoker@${{ env.GCP_PROJECT_ID }}.iam.gserviceaccount.com"

    gcloud run services update pdf-api \
      --region="${{ env.GCP_REGION }}" \
      --update-env-vars="BEAT_SELF_URL=${api_url},TASKS_INVOKER_SA=${invoker_sa},WORKER_URL_HEAVY=${heavy_url},WORKER_URL_LIGHT=${light_url},WORKER_URL_EMAILS=${emails_url}" \
      --quiet
```

Then **delete** the now-redundant `Set BEAT_SELF_URL on pdf-api` step (lines 302-307) — it's folded into the single update above to avoid two consecutive revisions of `pdf-api`.

## What stays unchanged

- `QUEUE_BACKEND` is NOT set here. It stays at the default `celery` until you flip it manually (or in a follow-up PR) — exactly as the existing summary note already promises.
- Worker deploy step keeps its own `WORKER_SELF_URL` second pass — that's per-worker and can't be folded in.
- `gcp-tasks-bootstrap.sh` still needs to be run once in Cloud Shell to create the invoker SA + queues; the workflow only references the SA by name.
- No changes to `pdf-server/app/core/queue.py` or the bootstrap script.

## Safety

- The new step runs only after all four services exist, so all `describe` calls resolve.
- Idempotent: re-running the workflow just rewrites the same env values.
- If `QUEUE_BACKEND=celery` (current default), the new env vars are inert — they're only read by `_cloud_tasks_enqueue`.

## Files touched

- `.github/workflows/pdf-server-deploy.yml` — add one step, remove one step.
