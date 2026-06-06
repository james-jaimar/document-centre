#!/usr/bin/env bash
# gcp-tasks-bootstrap.sh
#
# Phase 2 of the GCP cutover: create the Cloud Tasks queues, the invoker
# service account, and the Cloud Scheduler jobs that replace Celery beat.
#
# Idempotent — safe to re-run. Run once from Cloud Shell after the
# pdf-worker-{heavy,light,emails} services exist (they're deployed by the
# GitHub Actions workflow).
#
# Usage:
#   bash pdf-server/docker/gcp-tasks-bootstrap.sh
#
# Prereqs:
#   gcloud auth login
#   gcloud config set project project-59a14b18-b4df-4c6b-b09

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-project-59a14b18-b4df-4c6b-b09}"
# Compute region (Cloud Run services).
REGION="${GCP_REGION:-africa-south1}"
# Tasks/Scheduler region. Cloud Tasks + Cloud Scheduler are NOT offered in
# africa-south1, so the queue control plane lives in europe-west1 and pushes
# cross-region into Cloud Run. Override via GCP_TASKS_REGION if needed.
TASKS_REGION="${GCP_TASKS_REGION:-europe-west1}"
INVOKER_SA_NAME="cloud-tasks-invoker"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEFAULT_RUNTIME_SA="dc-pdf-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

API_SERVICE="pdf-api"
WORKER_HEAVY="pdf-worker-heavy"
WORKER_LIGHT="pdf-worker-light"
WORKER_EMAILS="pdf-worker-emails"

QUEUES=(documents-heavy documents-light emails-default emails-control)

log() { printf '\033[1;36m[bootstrap]\033[0m %s\n' "$*"; }

log "Enabling required APIs"
gcloud services enable \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com \
  --project="$PROJECT_ID" --quiet

log "Ensuring invoker service account ${INVOKER_SA}"
if ! gcloud iam service-accounts describe "$INVOKER_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$INVOKER_SA_NAME" \
    --display-name="Cloud Tasks → Cloud Run invoker" \
    --project="$PROJECT_ID"
fi

log "Creating Cloud Tasks queues (if missing)"
for q in "${QUEUES[@]}"; do
  if ! gcloud tasks queues describe "$q" --location="$TASKS_REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud tasks queues create "$q" --location="$TASKS_REGION" --project="$PROJECT_ID"
  fi
done

# Per-queue rate / retry tuning.
gcloud tasks queues update documents-heavy --location="$TASKS_REGION" --project="$PROJECT_ID" \
  --max-dispatches-per-second=5 --max-concurrent-dispatches=10 \
  --max-attempts=5 --min-backoff=10s --max-backoff=600s --quiet
gcloud tasks queues update documents-light --location="$TASKS_REGION" --project="$PROJECT_ID" \
  --max-dispatches-per-second=20 --max-concurrent-dispatches=40 \
  --max-attempts=5 --min-backoff=5s --max-backoff=300s --quiet
gcloud tasks queues update emails-default --location="$TASKS_REGION" --project="$PROJECT_ID" \
  --max-dispatches-per-second=10 --max-concurrent-dispatches=20 \
  --max-attempts=8 --min-backoff=30s --max-backoff=3600s --quiet
gcloud tasks queues update emails-control --location="$TASKS_REGION" --project="$PROJECT_ID" \
  --max-dispatches-per-second=2 --max-concurrent-dispatches=2 \
  --max-attempts=3 --min-backoff=10s --max-backoff=120s --quiet

resolve_url() {
  local svc="$1"
  gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT_ID" \
    --format='value(status.url)' 2>/dev/null || true
}

resolve_service_account() {
  local svc="$1"
  local service_account
  service_account="$(gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT_ID" \
    --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
  if [ -z "$service_account" ]; then
    service_account="$DEFAULT_RUNTIME_SA"
  fi
  printf '%s' "$service_account"
}

API_URL="$(resolve_url "$API_SERVICE")"
HEAVY_URL="$(resolve_url "$WORKER_HEAVY")"
LIGHT_URL="$(resolve_url "$WORKER_LIGHT")"
EMAILS_URL="$(resolve_url "$WORKER_EMAILS")"
RUNTIME_SA="${PDF_API_RUNTIME_SA:-$(resolve_service_account "$API_SERVICE")}" 

missing=()
[ -z "$API_URL" ]    && missing+=("$API_SERVICE")
[ -z "$HEAVY_URL" ]  && missing+=("$WORKER_HEAVY")
[ -z "$LIGHT_URL" ]  && missing+=("$WORKER_LIGHT")
[ -z "$EMAILS_URL" ] && missing+=("$WORKER_EMAILS")
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Missing Cloud Run services: ${missing[*]}"
  echo "Deploy them first via .github/workflows/pdf-server-deploy.yml, then re-run."
  exit 1
fi

log "Granting roles/run.invoker on each worker service to $INVOKER_SA"
for svc in "$WORKER_HEAVY" "$WORKER_LIGHT" "$WORKER_EMAILS"; do
  gcloud run services add-iam-policy-binding "$svc" \
    --region="$REGION" --project="$PROJECT_ID" \
    --member="serviceAccount:${INVOKER_SA}" \
    --role="roles/run.invoker" --quiet
done

log "Granting roles/run.invoker on pdf-api to $INVOKER_SA (beat endpoints)"
gcloud run services add-iam-policy-binding "$API_SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --member="serviceAccount:${INVOKER_SA}" \
  --role="roles/run.invoker" --quiet

log "Resolved pdf-api runtime service account: $RUNTIME_SA"
log "Granting roles/iam.serviceAccountUser on $INVOKER_SA to $RUNTIME_SA (Cloud Tasks CreateTask needs actAs on the OIDC SA)"
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountUser" --quiet

log "Also granting roles/iam.serviceAccountTokenCreator (belt-and-braces for OIDC token minting)"
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet

log "Granting roles/cloudtasks.enqueuer on project to $RUNTIME_SA (CreateTask permission)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudtasks.enqueuer" --condition=None --quiet >/dev/null

create_or_update_scheduler() {
  local name="$1" schedule="$2" url="$3"
  if gcloud scheduler jobs describe "$name" --location="$TASKS_REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" --location="$TASKS_REGION" --project="$PROJECT_ID" \
      --schedule="$schedule" --uri="$url" --http-method=POST \
      --oidc-service-account-email="$INVOKER_SA" --oidc-token-audience="${url%/internal/*}" --quiet
  else
    gcloud scheduler jobs create http "$name" --location="$TASKS_REGION" --project="$PROJECT_ID" \
      --schedule="$schedule" --uri="$url" --http-method=POST \
      --oidc-service-account-email="$INVOKER_SA" --oidc-token-audience="${url%/internal/*}" --quiet
  fi
}

log "Configuring Cloud Scheduler jobs (replaces Celery beat)"
create_or_update_scheduler "ops-snapshot-storage-hourly" "5 * * * *"   "${API_URL}/internal/beat/snapshot-storage"
create_or_update_scheduler "ops-cleanup-tmp-daily"        "30 3 * * *" "${API_URL}/internal/beat/cleanup-tmp"
create_or_update_scheduler "email-scan-outbox-30s"        "*/1 * * * *" "${API_URL}/internal/beat/email-scan-outbox"
create_or_update_scheduler "email-release-stuck-5m"       "*/5 * * * *" "${API_URL}/internal/beat/email-release-stuck"
# Cloud Scheduler minimum granularity is 1 min; emails-control queue
# tolerates the gap and Phase 2 keeps the VPS LISTEN/NOTIFY listener as
# the push path for sub-second email delivery.

log "Done. Worker URLs:"
echo "  WORKER_URL_HEAVY=$HEAVY_URL"
echo "  WORKER_URL_LIGHT=$LIGHT_URL"
echo "  WORKER_URL_EMAILS=$EMAILS_URL"
echo "  TASKS_INVOKER_SA=$INVOKER_SA"
echo "  GCP_REGION=$REGION         # Cloud Run (compute)"
echo "  GCP_TASKS_REGION=$TASKS_REGION  # Cloud Tasks + Scheduler"
echo "  QUEUE_BACKEND=cloud_tasks  # required — Celery fallback has no broker on Cloud Run"
echo ""
echo "Set these on the pdf-api Cloud Run service via Secret Manager or --set-env-vars."
echo "QUEUE_BACKEND MUST be cloud_tasks in this environment; the legacy Celery path"
echo "expects a Redis broker that does not exist on Cloud Run and will fail uploads."
