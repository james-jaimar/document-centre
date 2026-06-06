# Plan: Complete GCP cutover (Cloud Tasks + Cloud Scheduler)

Two parallel goals:
1. **Make uploads work** — finish the Cloud Tasks IAM cutover so `POST /v1/assets/{id}/inspect` stops 500'ing.
2. **Retire VPS Celery beat** — move the periodic-job scheduling onto Cloud Scheduler so the VPS only runs the email LISTEN/NOTIFY listener.

---

## Part A — Finish Cloud Tasks cutover

### A1. Verify & apply the IAM grants (Cloud Shell, one-time)
The code-side fixes from the previous turn are deployed. What's still missing is the live IAM binding on the project. Run in Cloud Shell:

```bash
PROJECT_ID=project-59a14b18-b4df-4c6b-b09
RUNTIME_SA=dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com
INVOKER_SA=cloud-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com

# actAs permission for OIDC enqueue
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser" --quiet

# CreateTask permission
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudtasks.enqueuer" --condition=None --quiet
```

Or simpler: re-run `bash pdf-server/docker/gcp-tasks-bootstrap.sh` — it's idempotent and already contains both grants.

### A2. Confirm Cloud Run env on `pdf-api`
Ensure `pdf-api` service has:
- `QUEUE_BACKEND=cloud_tasks`
- `GCP_PROJECT_ID`, `GCP_REGION=africa-south1`, `GCP_TASKS_REGION=europe-west1`
- `TASKS_INVOKER_SA=cloud-tasks-invoker@…`
- `WORKER_URL_HEAVY`, `WORKER_URL_LIGHT`, `WORKER_URL_EMAILS`

Add a small verification block to `gcp-tasks-bootstrap.sh` that prints the current `pdf-api` env so we can diff against the required vars.

### A3. End-to-end validation
After grants propagate (~60s):
- Upload a PDF in the UI → `POST /v1/assets/{id}/inspect` returns 200.
- Cloud Tasks console shows a task created in `documents-light`.
- `pdf-worker-light` logs show the task delivered + processed.

---

## Part B — Cloud Scheduler job-creation script (retire VPS beat)

### B1. Audit current beat jobs
Read `pdf-server/app/web/beat_routes.py` and current Celery beat schedule (systemd unit + any `beat_schedule` in code) to enumerate every periodic job, its cron expression, and target endpoint.

### B2. Extend `gcp-tasks-bootstrap.sh`
The script already creates 4 scheduler jobs (`ops-snapshot-storage-hourly`, `ops-cleanup-tmp-daily`, `email-scan-outbox-30s`, `email-release-stuck-5m`). Audit reveals whether more are needed. For each missing job, add a `create_or_update_scheduler` call with:
- Stable name (`<area>-<verb>-<cadence>`)
- Cron expression matching current Celery beat
- POST to `${API_URL}/internal/beat/<endpoint>`
- OIDC auth via `cloud-tasks-invoker`

### B3. Protect `/internal/beat/*` endpoints
Verify `beat_routes.py` either:
- requires OIDC token from `cloud-tasks-invoker`, or
- is mounted behind Cloud Run's `--no-allow-unauthenticated` with IAM invoker check.

If currently open, add a lightweight bearer/OIDC check using the existing pattern in `tasks_routes.py`.

### B4. VPS decommission of beat
- Disable & stop `document-centre-beat.service` on the VPS (manual command, documented in plan).
- Leave email listener service running (still needed for sub-second LISTEN/NOTIFY push).
- Document the kept-vs-removed services in `pdf-server/docs/` (new short note).

### B5. Validation
- Run `gcloud scheduler jobs list --location=europe-west1` and confirm all expected jobs exist.
- Manually trigger one job (`gcloud scheduler jobs run ops-cleanup-tmp-daily …`) and check `pdf-api` logs for the hit.
- Watch for 24h that all periodic jobs fire on schedule before removing the VPS beat unit permanently.

---

## Files touched

- `pdf-server/docker/gcp-tasks-bootstrap.sh` — extend scheduler section with any missing jobs from audit; add env-verification block for pdf-api.
- `pdf-server/app/web/beat_routes.py` — add OIDC/auth guard if missing.
- `pdf-server/docs/GCP_CUTOVER.md` (new) — short doc listing scheduler jobs, what runs where, and the VPS decommission steps.
- `.lovable/plan.md` — replace with this plan.

## Out of scope
- Moving the email LISTEN/NOTIFY listener off the VPS (stays for sub-second push latency, as previously agreed).
- Any worker code changes — the workers already speak HTTP via `tasks_routes.py`.
