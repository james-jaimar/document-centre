## Audit result — the migration is already done

Grepping `pdf-server/app/` for `.delay(` and `.apply_async(` returned **zero hits** outside `app/core/queue.py` itself. Every enqueue call site already routes through `app.core.queue.enqueue("task_name", ..., queue="...")`:

- `app/web/routes.py` — 22 call sites, all `enqueue(...)`
- `app/web/beat_routes.py` — 2 call sites
- `app/tasks/document_tasks.py` — 2 call sites
- `app/tasks/operation_tasks.py` — 1 call site
- `app/tasks/email_tasks.py` — 1 call site
- `app/email/listener.py` — 1 call site

`app/tasks/registry.py` already exports every task name used at those call sites (`normalize_asset`, `inspect_asset`, `rotate_pdf`, `grayscale_pdf`, `cmyk_pdf`, `resize_pdf`, `nup_pdf`, `impose_sheet_pdf`, `booklet_pdf`, `merge_pdfs`, `generate_previews`, `convert_office`, `normalize_orientation`, `print_ready`, `render_specific_pages`, `prepare_for_product`, `pad_pages_pdf`, `render_one_page`, `assemble_print_ready_for_job`, `assemble_imposed_sheet_for_job`, `render_job_ticket_for_job`, `cloudprinter_render`, `scan_outbox`, `send_email`, `release_stuck`, `ops.snapshot_storage`, `ops.cleanup_tmp`).

`app/web/tasks_routes.py` resolves any of those names from the registry, verifies OIDC against `WORKER_SELF_URL`, and runs them. `app/web/beat_routes.py` exposes the 4 Scheduler targets and the Scheduler jobs created by `gcp-tasks-bootstrap.sh` already point at them.

**Conclusion:** no code migration is needed. We just need to verify and flip.

## Plan — verification, then cutover

### 1. Sanity-check the registry vs. call sites (script-only, ~30s)
Add a tiny one-shot verification script `pdf-server/scripts/audit-enqueue-coverage.py` that:
- Greps `app/` for every `enqueue("<name>", ...)` literal
- Loads `app.tasks.registry.TASK_REGISTRY` and asserts every grepped name resolves
- Cross-checks the `queue=` value against `QUEUE_TO_CLOUD_TASKS_QUEUE` in `app/core/queue.py`

Run it locally. If it passes, every call site is dispatchable in both modes. This becomes a permanent regression guard we can wire into CI later if useful (not in this plan).

### 2. Smoke-test ONE worker endpoint while still on Celery (no traffic impact)
Manually fire a single Cloud Tasks request to `pdf-worker-light` to prove OIDC + dispatch work end-to-end without touching the API:

```text
gcloud tasks create-http-task \
  --queue=documents-light --location=europe-west1 \
  --url="$LIGHT_URL/internal/tasks/inspect_asset" \
  --oidc-service-account-email=cloud-tasks-invoker@<project>.iam.gserviceaccount.com \
  --oidc-token-audience="$LIGHT_URL" \
  --body-content='{"args":["<known-asset-id>","<job-id>",false],"kwargs":{}}'
```

Watch Cloud Run logs for `pdf-worker-light` — expect `running task=inspect_asset ...` and a 200. If this passes, the Cloud Tasks → HTTP worker → registry path is proven.

### 3. Flip `QUEUE_BACKEND=cloud_tasks` on pdf-api
One-liner, done in Cloud Shell (not the workflow — we want it as a deliberate manual toggle, not an automatic redeploy side effect):

```text
gcloud run services update pdf-api --region=africa-south1 \
  --update-env-vars=QUEUE_BACKEND=cloud_tasks
```

After this, every new `enqueue(...)` call from `pdf-api` goes to Cloud Tasks. In-flight VPS Celery jobs drain naturally — the VPS workers keep consuming whatever is already on Redis.

### 4. Soak for 24h, watching:
- Cloud Run logs on the three worker services for steady task throughput and zero 4xx/5xx
- Cloud Tasks console queue depth (should stay near 0)
- VPS Redis depth (should drain to 0 and stay there)
- Any Sentry / app errors on `pdf-api` from `_cloud_tasks_enqueue`

### 5. Retire VPS Celery beat
Once Cloud Scheduler is confirmed firing all 4 jobs (Scheduler console shows green runs), disable the VPS beat to stop double-scheduling:

```text
systemctl disable --now document-centre-beat.service
```

Keep `document-centre-worker-*.service` running for now as a safety net — they'll just be idle. Phase 3 of the plan covers full VPS decom.

## Technical details / risk notes

- **Cloud Tasks region mismatch is already handled** — `_cloud_tasks_enqueue` prefers `GCP_TASKS_REGION` (`europe-west1`) over `GCP_REGION` (`africa-south1`), matching where the queues live.
- **Failure mode if registry is missing a name**: `_cloud_tasks_enqueue` itself doesn't touch the registry, so an unknown name only fails on the worker side with a 404 from `tasks_routes.run_task`. Cloud Tasks will retry per queue config, eventually dead-letter. The audit script in step 1 prevents this.
- **`WORKER_SELF_URL` is set** by the deploy workflow's second pass, so worker-side OIDC verification is active — no DEV-ONLY warning path.
- **Rollback**: if anything misbehaves after step 3, set `QUEUE_BACKEND=celery` (or just remove the env var) on `pdf-api` and re-deploy. Any tasks already pushed to Cloud Tasks will still execute on the HTTP workers — they don't get cancelled, but that's fine; they're the same code path.

## Files to touch

- **New**: `pdf-server/scripts/audit-enqueue-coverage.py` — one-shot verification.
- **No changes** to: `app/core/queue.py`, `app/tasks/registry.py`, `app/web/tasks_routes.py`, `app/web/beat_routes.py`, the deploy workflow, or `gcp-tasks-bootstrap.sh`.

All other actions are gcloud commands run from Cloud Shell.
