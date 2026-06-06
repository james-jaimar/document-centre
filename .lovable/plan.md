## Problem

Cloud Tasks (and Cloud Scheduler) are not offered in `africa-south1`. The bootstrap script hard-codes `REGION=africa-south1` for both Cloud Run *and* the queues, so `gcloud tasks queues create` fails immediately.

Cloud Run services must stay in `africa-south1` (latency, existing LB/NEG, custom domain wiring all documented in `CUSTOM_DOMAIN.md`). Cloud Tasks can push to Cloud Run cross-region with no functional penalty — only the queue control plane needs a supported region.

## Fix: split compute region from tasks region

Introduce a second region variable used only for Cloud Tasks queues + Cloud Scheduler jobs. Default it to `europe-west1` (closest fully-supported Tasks/Scheduler region to ZA; same choice we'd document for ops).

### 1. `pdf-server/docker/gcp-tasks-bootstrap.sh`
- Add `TASKS_REGION="${GCP_TASKS_REGION:-europe-west1}"` alongside the existing `REGION`.
- Use `TASKS_REGION` for every `gcloud tasks queues …` and `gcloud scheduler jobs …` call.
- Keep `REGION` (africa-south1) for `gcloud run services describe` and the `run.invoker` IAM bindings.
- Print `TASKS_REGION` in the final summary block so the operator copies it into pdf-api env.

### 2. `pdf-server/app/core/queue.py`
- Read `GCP_TASKS_REGION` (fallback to `GCP_REGION` for back-compat) when building the queue path in `_cloud_tasks_enqueue`.
- Update the docstring env-var block to list both `GCP_REGION` (compute) and `GCP_TASKS_REGION` (queues/scheduler).

### 3. `.github/workflows/pdf-server-deploy.yml`
- Add `GCP_TASKS_REGION: europe-west1` to the top-level `env:` block (line ~33).
- Pass it into the `pdf-api` deploy step's `--set-env-vars` so `enqueue()` can build the correct queue path once `QUEUE_BACKEND=cloud_tasks` is flipped on. (Workers don't need it — they only receive HTTP pushes.)

No other files touched. No behavior change while `QUEUE_BACKEND=celery` (default). The bootstrap script becomes idempotent and re-runnable.

## Operator step after merge

Re-run from Cloud Shell:
```
bash gcp-tasks-bootstrap.sh
```
The `cloud-tasks-invoker` SA and any partial state from today's failed run are already present and will be reused (script is idempotent).

## Out of scope

- No change to Cloud Run region, LB, NEG, or custom domain config.
- No change to Phase 2.1 task code; this only unblocks the queue/scheduler control plane.
