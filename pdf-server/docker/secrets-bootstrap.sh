#!/usr/bin/env bash
# secrets-bootstrap.sh — one-time creation of GCP Secret Manager entries
# for the pdf-api Cloud Run service (Phase 1 of the cutover).
#
# Run interactively in Cloud Shell, once per environment:
#   bash pdf-server/docker/secrets-bootstrap.sh
#
# Idempotent: re-running prompts you to add a new version of each secret
# (you can press Enter to skip any value you don't want to rotate).
#
# Required secrets (will block the workflow if missing):
#   PDF_DATABASE_URL                  Postgres URL (use Supabase TRANSACTION-mode
#                                     pooler — port 6543 — for Cloud Run.
#                                     Format: postgresql+psycopg://postgres.<ref>:<password>
#                                       @aws-0-<region>.pooler.supabase.com:6543/postgres)
#   PDF_SUPABASE_URL                  https://<ref>.supabase.co
#   PDF_SUPABASE_SERVICE_ROLE_KEY     service_role JWT from Supabase
#   PDF_SUPABASE_STORAGE_BUCKET       e.g. "documents"
#   PDF_SECRET_KEY                    any 32+ char random string
#   PDF_CORS_ORIGINS                  comma-separated, e.g.
#                                     "https://document-centre.com,https://www.document-centre.com"
#
# Optional (skip with Enter — Cloud Run will simply not mount them):
#   PDF_STORAGE_MODE                  "supabase" | "s3"
#   PDF_AWS_S3_BUCKET, PDF_AWS_S3_REGION,
#   PDF_AWS_ACCESS_KEY_ID, PDF_AWS_SECRET_ACCESS_KEY
#   PDF_ADMIN_USERNAME, PDF_ADMIN_PASSWORD

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-59a14b18-b4df-4c6b-b09}"
RUNTIME_SA="${RUNTIME_SA:-dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"

REQUIRED=(
  PDF_DATABASE_URL
  PDF_SUPABASE_URL
  PDF_SUPABASE_SERVICE_ROLE_KEY
  PDF_SUPABASE_STORAGE_BUCKET
  PDF_SECRET_KEY
  PDF_CORS_ORIGINS
)

OPTIONAL=(
  PDF_STORAGE_MODE
  PDF_AWS_S3_BUCKET
  PDF_AWS_S3_REGION
  PDF_AWS_ACCESS_KEY_ID
  PDF_AWS_SECRET_ACCESS_KEY
  PDF_ADMIN_USERNAME
  PDF_ADMIN_PASSWORD
)

gcloud config set project "$PROJECT_ID" >/dev/null

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
  # Grant runtime SA access (idempotent)
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None >/dev/null 2>&1 || true
}

echo "── Required secrets ────────────────────────────────────────────"
for s in "${REQUIRED[@]}"; do upsert "$s" "$s" required; done

echo
echo "── Optional secrets ────────────────────────────────────────────"
for s in "${OPTIONAL[@]}"; do upsert "$s" "$s" optional; done

echo
echo "Done. Push to main (or run the workflow manually) to deploy pdf-api."
