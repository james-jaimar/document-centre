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

cat <<MSG

Ubuntu packages installed.

Next:
1. Copy the repo into /opt/document-centre-api
2. Copy .env.example to /opt/document-centre-api/.env and fill it in
3. Run: sudo bash scripts/bootstrap-app.sh
4. Install the systemd and nginx files from deploy/

MSG
