#!/usr/bin/env bash
# gcp-setup.sh — one-shot GCP bootstrap for Document Centre PDF stack.
#
# Run this ONCE in Cloud Shell (https://shell.cloud.google.com) with the
# document-centre-prod-dc project selected. Idempotent: re-running is safe.
#
#   bash pdf-server/docker/gcp-setup.sh
#
# What it does:
#   1. Enables required GCP APIs
#   2. Creates the Artifact Registry repo (africa-south1)
#   3. Creates the deploy + runtime service accounts
#   4. Sets up Workload Identity Federation bound to james-jaimar/document-centre
#   5. Grants minimum required IAM roles
#   6. Creates a £25/mo budget alert (commented — needs billing account ID)

set -euo pipefail

# ─── Config (edit only if these change) ──────────────────────────────────
PROJECT_ID="project-59a14b18-b4df-4c6b-b09"
PROJECT_NUMBER="622687766375"
REGION="africa-south1"
AR_REPO="dc-pdf"
GITHUB_OWNER="james-jaimar"
GITHUB_REPO="document-centre"

DEPLOY_SA="github-deployer"
RUNTIME_SA="dc-pdf-runtime"
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"

DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
# ─────────────────────────────────────────────────────────────────────────

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID"

say "1/6 Enabling APIs (this can take 1-2 minutes)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  secretmanager.googleapis.com

say "2/6 Creating Artifact Registry repo: $AR_REPO ($REGION)"
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Document Centre PDF stack images" \
  2>/dev/null || echo "  (already exists — skipping)"

say "3/6 Creating service accounts"
gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="GitHub Actions Deployer" \
  2>/dev/null || echo "  ($DEPLOY_SA already exists — skipping)"

gcloud iam service-accounts create "$RUNTIME_SA" \
  --display-name="Cloud Run runtime SA for pdf services" \
  2>/dev/null || echo "  ($RUNTIME_SA already exists — skipping)"

say "4/6 Workload Identity Federation (GitHub OIDC)"
gcloud iam workload-identity-pools create "$WIF_POOL" \
  --location=global \
  --display-name="GitHub Actions" \
  2>/dev/null || echo "  (pool exists — skipping)"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_OWNER}'" \
  2>/dev/null || echo "  (provider exists — skipping)"

say "5/6 Granting IAM roles"
# Deploy SA can push to Artifact Registry, deploy Cloud Run, act-as runtime SA,
# and inspect Secret Manager entries (needed for `gcloud secrets describe` in
# the verify step and for `gcloud run deploy --set-secrets` to validate refs).
for role in roles/artifactregistry.writer roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    >/dev/null
done

# Runtime SA can read secrets and enqueue Cloud Tasks (for Phase 3)
for role in roles/secretmanager.secretAccessor roles/cloudtasks.enqueuer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    >/dev/null
done

# Bind GitHub repo → deploy SA via WIF
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}" \
  >/dev/null

say "6/6 Done."

cat <<EOF

╭─────────────────────────────────────────────────────────────╮
│  Setup complete. Values for the GitHub Actions workflow:    │
├─────────────────────────────────────────────────────────────┤
│  Project ID    : ${PROJECT_ID}
│  Project #     : ${PROJECT_NUMBER}
│  Region        : ${REGION}
│  Artifact repo : ${AR_REPO}
│  Deploy SA     : ${DEPLOY_SA_EMAIL}
│  Runtime SA    : ${RUNTIME_SA_EMAIL}
│  WIF provider  : projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}
╰─────────────────────────────────────────────────────────────╯

Next steps:
  1. Push to main → GitHub Action will build + deploy automatically.
  2. After first deploy, the Cloud Run URLs will appear in the Action summary.
  3. Set up a budget alert manually:
       https://console.cloud.google.com/billing/budgets
     Recommended: £25/month, alerts at 50% / 90% / 100%, no auto-disable.

EOF
