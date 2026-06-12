# Cloud Run right-sizing — "200 stores" target

Goal: comfortably absorb realistic peak (≈50 concurrent uploads, bursts to ≈100) for the next few months while keeping idle spend near zero. All ceilings are headroom — Cloud Run only bills for instances that actually run.

## Target configuration

| Service | CPU / RAM | Concurrency | min | max | Notes |
|---|---|---|---|---|---|
| `pdf-api` | 1 / 1Gi | 80 | 0 | 10 | Unchanged. Auto-scales on HTTP. |
| `pdf-worker-heavy` | 2 / 4Gi | **2** | **0** | **5** | LibreOffice/imposition; store owners tolerate slower turnaround. |
| `pdf-worker-light` | 4 / 4Gi | **4** | **0** | **50** | Headroom for 200 concurrent renders. First job/day pays ~6–10s cold start. |
| `pdf-worker-emails` | 1 / 512Mi | **8** | **1** | **10** | Keep warm (~£2–3/mo) so transactional email is instant. |

Cloud Tasks queue limits (in `pdf-server/docker/gcp-tasks-bootstrap.sh`) rise to match: `documents-heavy` max-concurrent=10, `documents-light` max-concurrent=200, `emails-default` max-concurrent=80.

## Files to change

1. `.github/workflows/pdf-server-deploy.yml` — parameterise `deploy_worker` so each worker sets its own `--concurrency` and `--max-instances` (currently shared). Apply the table above.
2. `pdf-server/docker/gcp-tasks-bootstrap.sh` — update the four `gcloud tasks queues update` lines to match the new max-concurrent-dispatches.
3. `pdf-server/docs/GCP_CUTOVER.md` — document the new sizing and the "scale-up trigger" rule (see below).
4. No application code changes. No VPS changes. No Supabase changes.

## Cost expectation

- Idle (nights, weekends, no uploads): ~£3–5/mo (only the warm emails instance).
- Pilot week (you + a handful of test branches): ~£8–15/mo.
- 50 active branches doing real jobs daily: ~£40–70/mo.
- 200 active branches: ~£120–180/mo, scales linearly with actual document volume — not with the max-instances ceiling.

Compare to the £20-over-8-days burn you saw: that was ~85% pinned idle instances, which this plan eliminates.

## Operational safety net

After deploy, set two **GCP billing alerts** (console, no code) at £75/mo and £200/mo, emailed to you. If either fires earlier than expected, that is the signal to look — not to scale down preemptively. Cloud Run keeps every revision, so any sizing change is one `gcloud run services update-traffic` rollback away.

## Scale-up triggers (set-and-forget rules)

Only revisit sizing when one of these hits:
- A branch owner reports an upload that "sat queued" >30s during business hours → bump light `max-instances` from 50 → 100.
- Sustained heavy queue depth >5 jobs for >5 min → raise heavy `max-instances` from 5 → 10 and concurrency from 2 → 3.
- Email send latency >10s on a transactional email → raise emails `min-instances` from 1 → 2.

Each is a single workflow re-run, zero downtime.

## Rollout

1. Merge the workflow + bootstrap changes.
2. GitHub Actions redeploys all four services with new sizing.
3. Re-run `bash pdf-server/docker/gcp-tasks-bootstrap.sh` once from Cloud Shell to apply the new queue limits.
4. Configure the two billing alerts in GCP console.
5. Watch GCP billing for 48h — expect ~70% drop from current daily run-rate.

## What this plan does **not** do

- Does not touch `pdf-api`, application code, Cloud Scheduler jobs, or the VPS LISTEN/NOTIFY email listener.
- Does not change Supabase plan or connection pooling (Pro plan's 2,000 PgBouncer connections is plenty for this tier).
- Does not add caching, batching, or architectural changes — those only become worthwhile past ~200 active branches.
