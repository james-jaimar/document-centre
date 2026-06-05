#!/usr/bin/env bash
# secrets-bootstrap.sh — one-time creation of GCP Secret Manager entries
# for the pdf-api Cloud Run service (Phase 1 of the cutover).
#
# Run interactively in Cloud Shell, once per environment:
#   bash pdf-server/docker/secrets-bootstrap.sh
#
# Idempotent: re-running adds a new version of any secret you supply a value
# for, and skips ones you leave blank.
#
# Storage model: S3 only (af-south-1). Supabase is used purely for Postgres
# (and a small legacy fallback in storage.py that is unreachable in
# production). PDF_SUPABASE_URL / PDF_SUPABASE_SERVICE_ROLE_KEY are still
# required because the FastAPI app instantiates a Supabase client at boot
# for DB-adjacent calls — not for file storage.
#
# Required secrets (workflow blocks deploy if any are missing):
#   PDF_DATABASE_URL                  Postgres URL. MUST use the Supabase
#                                     TRANSACTION-mode pooler (port 6543).
#                                     Cloud Run is ephemeral and will
#                                     exhaust direct connections (5432).
#                                     Format: postgresql+psycopg://postgres.<ref>:<password>
#                                       @aws-0-<region>.pooler.supabase.com:6543/postgres
#   PDF_SUPABASE_URL                  https://<ref>.supabase.co
#   PDF_SUPABASE_SERVICE_ROLE_KEY     service_role JWT from Supabase
#   PDF_SECRET_KEY                    any 32+ char random string
#   PDF_CORS_ORIGINS                  comma-separated, e.g.
#                                     "https://document-centre.com,https://www.document-centre.com"
#   PDF_STORAGE_MODE                  must be "s3"
#   PDF_AWS_S3_BUCKET                 e.g. "jaimar-dev-600743178200-af-south-1-an"
#   PDF_AWS_S3_REGION                 "af-south-1"
#   PDF_AWS_ACCESS_KEY_ID             IAM access key with bucket access
#   PDF_AWS_SECRET_ACCESS_KEY         matching secret
#
# Optional (skip with Enter — Cloud Run will simply not mount them):
#   PDF_SUPABASE_STORAGE_BUCKET       legacy, unused in S3 mode
#   PDF_ADMIN_USERNAME, PDF_ADMIN_PASSWORD

set -euo pipefail

# Modes:
#   (default)    — prompt for each secret value, create/update versions, then grant IAM.
#   --iam-only   — skip prompts; only (re)apply the IAM bindings on already-existing
#                  secrets. Use this when the deploy workflow fails with
#                  PERMISSION_DENIED but the secret values are already correct.
IAM_ONLY=0
if [ "${1:-}" = "--iam-only" ]; then
  IAM_ONLY=1
fi

PROJECT_ID="${PROJECT_ID:-project-59a14b18-b4df-4c6b-b09}"
RUNTIME_SA="${RUNTIME_SA:-dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
DEPLOY_SA="${DEPLOY_SA:-github-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"

REQUIRED=(
  PDF_DATABASE_URL
  PDF_SUPABASE_URL
  PDF_SUPABASE_SERVICE_ROLE_KEY
  PDF_SECRET_KEY
  PDF_CORS_ORIGINS
  PDF_STORAGE_MODE
  PDF_AWS_S3_BUCKET
  PDF_AWS_S3_REGION
  PDF_AWS_ACCESS_KEY_ID
  PDF_AWS_SECRET_ACCESS_KEY
)

OPTIONAL=(
  PDF_SUPABASE_STORAGE_BUCKET
  PDF_ADMIN_USERNAME
  PDF_ADMIN_PASSWORD
)

gcloud config set project "$PROJECT_ID" >/dev/null

grant_iam() {
  local name="$1"
  # Runtime SA reads values at container boot
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None >/dev/null 2>&1 || true
  # Deploy SA needs viewer so the workflow can `describe` + `--set-secrets`
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role="roles/secretmanager.viewer" \
    --condition=None >/dev/null 2>&1 || true
}

upsert() {
  local name="$1"
  local prompt="$2"
  local required="$3"
  local value
  printf '\n%s\n' "$prompt"
  if [ "$required" = "required" ]; then
    printf '  [required] Enter value for %s: ' "$name"
  else
    printf '  [optional, Enter to skip] Value for %s: ' "$name"
  fi
  read -rs value
  echo
  if [ -z "$value" ]; then
    if [ "$required" = "required" ]; then
      echo "  ✗ $name is required — re-run the script."
      exit 1
    fi
    echo "  (skipped)"
    return
  fi
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
    echo "  ✓ added new version of $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --replication-policy=automatic --data-file=- >/dev/null
    echo "  ✓ created $name"
  fi
  grant_iam "$name"
}

iam_only() {
  local name="$1"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    grant_iam "$name"
    echo "  ✓ IAM applied: $name"
  else
    echo "  (skipped, secret does not exist): $name"
  fi
}

if [ "$IAM_ONLY" = "1" ]; then
  echo "── IAM-only mode: applying bindings to existing secrets ─────────"
  for s in "${REQUIRED[@]}"; do iam_only "$s"; done
  for s in "${OPTIONAL[@]}"; do iam_only "$s"; done
  echo
  echo "Done. Re-run the GitHub Actions workflow."
  exit 0
fi

echo "── Required secrets ────────────────────────────────────────────"
for s in "${REQUIRED[@]}"; do upsert "$s" "$s" required; done

echo
echo "── Optional secrets ────────────────────────────────────────────"
for s in "${OPTIONAL[@]}"; do upsert "$s" "$s" optional; done

echo
echo "Done. Push to main (or run the workflow manually) to deploy pdf-api."
