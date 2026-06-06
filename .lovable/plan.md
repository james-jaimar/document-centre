# Retire VPS & supercharge thumbnail performance

## ✅ Done in this branch

### Part 1 — Webhook-based email trigger (replaces VPS LISTEN/NOTIFY)
- New endpoint: `POST /internal/email/notify` on `pdf-api`
  (`pdf-server/app/web/beat_routes.py` → `email_push_router`)
- Shared-secret auth via `X-Webhook-Token` header (Supabase Database
  Webhooks cannot sign Google OIDC tokens, so a shared secret is used
  instead of OIDC — the side-effect is bounded to one enqueue).
- Wired into `pdf-server/app/main.py`.
- Deploy workflow mounts `EMAIL_NOTIFY_TOKEN` from GCP Secret Manager
  (`PDF_EMAIL_NOTIFY_TOKEN`, optional — deploys don't break without it).

### Part 2 — Thumbnail worker scaled up
- `pdf-worker-light`: **1 vCPU/1 GiB → 4 vCPU/4 GiB**
  (`.github/workflows/pdf-server-deploy.yml`)
- Render code is **already parallel**:
  `ThreadPoolExecutor(max_workers=os.cpu_count() - 1)` plus a batch
  Ghostscript path for ≤200 pages. Bumping CPU auto-scales the pool.
- Cost: ~neutral per job (Cloud Run bills vCPU-seconds; 4× CPU rate ×
  ¼ wall-clock ≈ same total).
- Expected user-visible speedup on 40–100 page uploads: ~3–4× faster.

## ⚠️ Manual steps the user must run

1. **Create the GCP secret** (one-off, in Cloud Shell):
   ```bash
   TOKEN=$(openssl rand -hex 32)
   echo "$TOKEN"   # save — needed for the SQL trigger
   printf '%s' "$TOKEN" | gcloud secrets create PDF_EMAIL_NOTIFY_TOKEN \
     --project=project-59a14b18-b4df-4c6b-b09 --data-file=-
   gcloud secrets add-iam-policy-binding PDF_EMAIL_NOTIFY_TOKEN \
     --project=project-59a14b18-b4df-4c6b-b09 \
     --member="serviceAccount:dc-pdf-runtime@project-59a14b18-b4df-4c6b-b09.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

2. **Re-run the GitHub Action** so pdf-api picks up the new secret AND
   pdf-worker-light deploys with 4 CPU.

3. **Install the Supabase trigger** — paste the SQL from
   `pdf-server/docs/VPS_DECOMMISSION.md` (section 3) into the Supabase
   SQL editor, with the pdf-api URL and the token substituted in.

4. **Verify** (see `VPS_DECOMMISSION.md` section 4): send a test email,
   confirm `email_outbox` status flips within a few seconds and
   `net._http_response` shows 200.

5. **After 24h burn-in**: disable the VPS service and cancel the VPS
   (commands in `VPS_DECOMMISSION.md` section 5).

## Measurement to do after deploy

Upload representative PDFs (10, 50, 100 pages) and record:
- Time-to-first-thumbnail
- Time-to-all-thumbnails
- Compare against pre-deploy baseline

If 4 CPU isn't enough, bump `pdf-worker-light` to 8 vCPU/8 GiB
(Cloud Run ceiling is 8 vCPU / 32 GiB per instance) — one-line change
in the deploy workflow.

## Files changed
- `pdf-server/app/web/beat_routes.py` — new `email_push_router` + auth
- `pdf-server/app/main.py` — mount the new router
- `.github/workflows/pdf-server-deploy.yml` — light worker resources + secret
- `pdf-server/docs/VPS_DECOMMISSION.md` — full runbook (new)
