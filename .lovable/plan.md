# Retire VPS & supercharge thumbnail performance

## Part 1 — Replace VPS email listener with Supabase Database Webhook

**Goal:** eliminate the `document-centre-listener-emails` systemd service and shut down the VPS. 30–60s email latency is acceptable.

### Steps

1. **Add endpoint** `POST /internal/email/notify` on `pdf-api`
   - Enqueues a `scan_outbox` Cloud Task on `emails-control` (same path the VPS listener uses today).
   - OIDC-protected, matching the existing `/internal/beat/*` routes.
   - Idempotent — bursts collapse to one scan via Cloud Tasks dedupe.

2. **Create Supabase Database Webhook**
   - Trigger: `AFTER INSERT ON public.email_outbox`
   - Target: `https://<pdf-api-url>/internal/email/notify`
   - Auth: bearer token via `pg_net` headers.
   - Replaces the existing `notify_email_dispatcher` `pg_notify` trigger.

3. **Cutover**
   - Deploy endpoint → enable webhook → verify a few test sends.
   - Cloud Scheduler `email-scan-outbox` (1 min) stays as safety net.
   - No parallel burn-in needed — both paths claim through `claim_email_batch` with `FOR UPDATE SKIP LOCKED`, so dupes are impossible.

4. **Decommission VPS**
   - `systemctl disable --now document-centre-listener-emails.service`
   - Cancel VPS, update `pdf-server/docs/GCP_CUTOVER.md`.

## Part 2 — Thumbnail performance: verify parallelism, then throw CPU at it

**Strategy:** Cloud Run bills vCPU-seconds. If thumbnail rendering parallelises across CPUs, doubling CPU halves wall-clock time at ~same cost. So the right order is **measure first, then scale**.

### Step 1 — Audit the thumbnail render path (read-only investigation)

Trace `generate_previews` in `pdf-server/app/tasks/` to answer:
- Does it render pages with a process pool / thread pool, or a `for` loop?
- Does each page render shell out to Ghostscript/pdftoppm one-at-a-time, or batch?
- Is S3 upload of finished thumbnails serial or concurrent?

This audit drives the decision. No code changes in step 1.

### Step 2 — If sequential, parallelise it first

Convert the per-page loop to a `concurrent.futures.ProcessPoolExecutor` sized to `os.cpu_count()`. Each child process renders one page. Ghostscript is single-threaded per invocation, so process pool > thread pool here.

### Step 3 — Scale `pdf-worker-light` aggressively

Once parallelism is confirmed, update `.github/workflows/pdf-server-deploy.yml`:

| Setting | Current | Proposed | Rationale |
|---|---|---|---|
| `--cpu` | 1 | **4** | 4 pages render in parallel; wall-clock ÷ 4 |
| `--memory` | 1Gi | **4Gi** | Headroom for 4 concurrent Ghostscript processes |
| `--concurrency` | 1 | 1 | One job per container — full CPU per job |
| `--max-instances` | 20 | 20 | Unchanged |
| `--min-instances` | 0 | 0 | Cold start acceptable; saves flat cost |

**Cost expectation:** roughly cost-neutral per job (4× CPU rate × ¼ duration). Customer waits ~¼ as long for thumbnails.

### Step 4 — Measure

Upload representative test PDFs (10, 50, 100 pages) before and after. Record:
- Time-to-first-thumbnail
- Time-to-all-thumbnails
- Cloud Run billing for the same workload (GCP Console → Billing → Cloud Run line item)

If 4 CPU isn't enough, bump to 8. The ceiling on Cloud Run is 8 vCPU / 32 GiB per instance.

### What we deliberately skip

- **`min-instances=1`** — user is fine with cold start; saves ~€8–12/month.
- **Heavy / API / email worker changes** — they're sized correctly for their workloads.

## Technical notes

- New endpoint lives in `pdf-server/app/web/` (sibling to `beat_routes.py`), reuses existing OIDC verification.
- Supabase webhook uses `supabase_functions.http_request` via `pg_net`.
- Parallelisation pattern: `ProcessPoolExecutor(max_workers=os.cpu_count())` around the per-page render fn.
- Both parts are independent — can ship in either order.
