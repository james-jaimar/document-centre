#!/usr/bin/env bash
# cleanup-artifact-registry.sh — prune old Docker images from Artifact Registry.
#
# Keeps the N most recently created images (default 5) plus the :buildcache
# tag (required for registry layer caching in the GitHub Actions workflow).
# Everything else is deleted.
#
# Usage:
#   bash pdf-server/scripts/cleanup-artifact-registry.sh                # dry-run, default keep=5
#   bash pdf-server/scripts/cleanup-artifact-registry.sh --force        # actually delete
#   bash pdf-server/scripts/cleanup-artifact-registry.sh --force --keep=3
#
# Env overrides:
#   GCP_PROJECT_ID, GCP_REGION, AR_REPO, IMAGE_NAME

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-project-59a14b18-b4df-4c6b-b09}"
REGION="${GCP_REGION:-africa-south1}"
AR_REPO="${AR_REPO:-dc-pdf}"
IMAGE_NAME="${IMAGE_NAME:-server}"
KEEP=5
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) FORCE=0 ;;
    --keep=*) KEEP="${arg#--keep=}" ;;
    -h|--help)
      sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${IMAGE_NAME}"

log() { printf '\033[1;36m[cleanup]\033[0m %s\n' "$*"; }

log "Repo:    $IMAGE_PATH"
log "Keep:    $KEEP newest (plus :buildcache)"
log "Mode:    $([ "$FORCE" = 1 ] && echo 'DELETE' || echo 'DRY-RUN (pass --force to delete)')"

# List all image digests, sorted by createTime descending.
# Each line: DIGEST<TAB>CREATE_TIME<TAB>TAGS(comma-separated)
mapfile -t ROWS < <(
  gcloud artifacts docker images list "$IMAGE_PATH" \
    --include-tags \
    --sort-by="~CREATE_TIME" \
    --format='value(version,createTime,tags)' \
    --project="$PROJECT_ID" 2>/dev/null
)

total=${#ROWS[@]}
log "Found $total image versions"

if [ "$total" -eq 0 ]; then
  log "Nothing to do."
  exit 0
fi

kept=0
to_delete=()
for row in "${ROWS[@]}"; do
  digest=$(echo "$row" | awk '{print $1}')
  created=$(echo "$row" | awk '{print $2}')
  tags=$(echo "$row" | awk '{for(i=3;i<=NF;++i) printf "%s ", $i}')
  # Always keep the buildcache tag — needed for layer caching.
  if echo "$tags" | grep -q 'buildcache'; then
    log "KEEP  (buildcache)  $digest  $created  [$tags]"
    continue
  fi
  if [ "$kept" -lt "$KEEP" ]; then
    log "KEEP  (recent #$((kept+1)))  $digest  $created  [$tags]"
    kept=$((kept+1))
  else
    to_delete+=("$digest")
    log "PRUNE                $digest  $created  [$tags]"
  fi
done

log "Summary: keep=$kept (+buildcache), delete=${#to_delete[@]}"

if [ "${#to_delete[@]}" -eq 0 ]; then
  log "Nothing to prune."
  exit 0
fi

if [ "$FORCE" != 1 ]; then
  log "Dry-run only. Re-run with --force to delete."
  exit 0
fi

for digest in "${to_delete[@]}"; do
  ref="${IMAGE_PATH}@${digest}"
  log "Deleting $ref"
  gcloud artifacts docker images delete "$ref" \
    --delete-tags --quiet --project="$PROJECT_ID" || \
    log "  (failed — may be in use by a Cloud Run revision; skipping)"
done

log "Done."
