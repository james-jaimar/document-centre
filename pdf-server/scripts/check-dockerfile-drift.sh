#!/usr/bin/env bash
# check-dockerfile-drift.sh — run locally before pushing.
#
# Fails (non-zero exit) if requirements.txt or the Ubuntu install script have
# changed since the last commit that touched the Dockerfile or MANIFEST.md.
# Catches the most common drift: someone adds a pip dep or apt package on the
# VPS and forgets to mirror it into the container image.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LAST_DOCKER_COMMIT="$(git log -n1 --format=%H -- pdf-server/Dockerfile pdf-server/docker/MANIFEST.md)"
if [ -z "$LAST_DOCKER_COMMIT" ]; then
  echo "No prior commit touched Dockerfile/MANIFEST — skipping drift check."
  exit 0
fi

CHANGED_SINCE=$(git diff --name-only "$LAST_DOCKER_COMMIT" HEAD -- \
  pdf-server/requirements.txt \
  pdf-server/scripts/install-ubuntu.sh \
  pdf-server/scripts/install-icc-profiles.sh \
  pdf-server/scripts/install-pdfcpu.sh)

if [ -n "$CHANGED_SINCE" ]; then
  echo "❌ Drift detected. These files changed since the Dockerfile/MANIFEST were last updated:"
  echo "$CHANGED_SINCE" | sed 's/^/   - /'
  echo ""
  echo "Update pdf-server/Dockerfile and pdf-server/docker/MANIFEST.md to match, or"
  echo "explicitly bump MANIFEST.md to acknowledge no Docker change is needed."
  exit 1
fi

echo "✅ No Dockerfile drift."
