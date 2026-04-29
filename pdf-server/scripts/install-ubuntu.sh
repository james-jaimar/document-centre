#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-ubuntu.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip python3-dev \
  build-essential pkg-config libqpdf-dev libjpeg-dev zlib1g-dev libffi-dev \
  ghostscript libreoffice qpdf poppler-utils redis-server nginx \
  curl unzip xz-utils git fonts-dejavu-core ca-certificates

systemctl enable redis-server
systemctl restart redis-server

mkdir -p /opt/document-centre-api /opt/document-centre-api/storage /opt/document-centre-api/tmp
chown -R root:root /opt/document-centre-api

# If the repo is already in place, self-heal the worker units so an upgrade
# never leaves the box on the deprecated single-pool worker.
if [[ -x /opt/document-centre-api/scripts/migrate-to-split-workers.sh ]]; then
  echo ">> Migrating to split heavy/light workers (idempotent)…"
  bash /opt/document-centre-api/scripts/migrate-to-split-workers.sh || true
fi

# Install ICC profiles required by the print-ready CMYK conversion.
if [[ -x /opt/document-centre-api/scripts/install-icc-profiles.sh ]]; then
  echo ">> Installing ICC profiles (idempotent)…"
  bash /opt/document-centre-api/scripts/install-icc-profiles.sh || true
fi

cat <<MSG

Ubuntu packages installed.

Next:
1. Copy the repo into /opt/document-centre-api
2. Copy .env.example to /opt/document-centre-api/.env and fill it in
3. Run: sudo bash scripts/bootstrap-app.sh
4. Install the systemd and nginx files from deploy/
5. Run: sudo bash scripts/migrate-to-split-workers.sh
   (idempotent — switches off the deprecated single-pool worker and
    starts the heavy + light units. Verify with
    'celery -A app.worker.celery_app inspect active_queues'.)

MSG
