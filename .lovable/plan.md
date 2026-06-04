# Phase 2 — GCP Cloud Shell setup, then first deploy

Fonts are in git. Next steps run in your browser via **Google Cloud Shell** (no Windows tooling needed).

## Step 1 — Open Cloud Shell

1. Go to https://console.cloud.google.com/?project=project-59a14b18-b4df-4c6b-b09
2. Top-right toolbar → click the **`>_`** terminal icon ("Activate Cloud Shell")
3. Wait for the shell to provision (~30s)

## Step 2 — Pull the latest repo into Cloud Shell

```bash
cd ~
git clone https://github.com/james-jaimar/document-centre.git || (cd document-centre && git pull)
cd ~/document-centre
ls pdf-server/fonts/microsoft pdf-server/fonts/century-gothic | head
```

You should see the proprietary font files listed. If not, stop and tell me.

## Step 3 — Run the GCP setup script

```bash
bash pdf-server/docker/gcp-setup.sh
```

This is **idempotent** — safe to re-run. It will:

- Enable APIs: `run`, `artifactregistry`, `iam`, `iamcredentials`, `cloudbuild`, `secretmanager`
- Create Artifact Registry repo `dc-pdf` in `africa-south1`
- Create runtime service account `dc-pdf-runtime@…`
- Create deployer service account `github-deployer@…`
- Create Workload Identity Pool `github-pool` + provider `github-provider`
- Bind `github-deployer` to the repo `james-jaimar/document-centre` via WIF
- Grant `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer` to the deployer

When it finishes, copy the final summary block it prints. Paste it back to me so I can verify the WIF provider string matches what's hard-coded in `.github/workflows/pdf-server-deploy.yml`.

## Step 4 — Trigger the first deploy

Either:

**Option A — empty commit (recommended, cleanest):**
```bash
cd ~/document-centre
git commit --allow-empty -m "ci: trigger first Cloud Run deploy"
git push origin main
```

**Option B — manual trigger:**
1. Go to https://github.com/james-jaimar/document-centre/actions/workflows/pdf-server-deploy.yml
2. Click **Run workflow** → branch `main` → green button

## Step 5 — Watch the build

- GitHub Actions: https://github.com/james-jaimar/document-centre/actions
- Expected runtime: 8–14 min (first build pulls Ubuntu 24.04 + LibreOffice + all fonts)
- Three services will be created in Cloud Run on success: `pdf-api`, `pdf-worker-heavy`, `pdf-worker-light`

## Step 6 — Smoke test pdf-api

After the workflow goes green, in Cloud Shell:

```bash
PDF_API_URL=$(gcloud run services describe pdf-api --region africa-south1 --format='value(status.url)')
echo "$PDF_API_URL"
curl -fsS "$PDF_API_URL/health" || curl -fsS "$PDF_API_URL/"
```

Paste the output back to me.

---

## What I need from you

Just confirm: **"go"** and I'll switch to build mode if there's anything to update on the Lovable side after Step 6 (env vars in `usePdfApi`, edge function proxy URLs, etc.). For Steps 1–6 themselves, no code changes are needed — they're all Cloud Shell + GitHub Actions, and I'll watch the output you paste back.

If the `gcp-setup.sh` script fails on any step, paste the full error and I'll patch it.
